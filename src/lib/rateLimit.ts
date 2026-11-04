import connectDB from "@/lib/db";
import RateLimit from "@/models/RateLimit";

export interface RateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
    unavailable?: boolean;
}

export interface RateLimitRule {
    key: string;
    limit: number;
    windowMs: number;
}

function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

/**
 * Per-instance counters checked before MongoDB. One instance seeing more than the limit means
 * the shared count is over it too, so a flood is turned away without a database round trip.
 */
const MEMORY_MAX_KEYS = 20_000;
const memoryCounters = new Map<string, { count: number; windowEnd: number }>();

function consumeMemory(windowKey: string, windowEnd: number, now: number): number {
    const entry = memoryCounters.get(windowKey);
    if (entry) {
        entry.count += 1;
        return entry.count;
    }
    if (memoryCounters.size >= MEMORY_MAX_KEYS) {
        for (const [key, value] of memoryCounters) {
            if (value.windowEnd <= now) memoryCounters.delete(key);
        }
        // Still full of live windows: drop the oldest entries (Map keeps insertion order).
        const excess = memoryCounters.size - MEMORY_MAX_KEYS + 1;
        if (excess > 0) {
            let removed = 0;
            for (const key of memoryCounters.keys()) {
                if (removed++ >= excess) break;
                memoryCounters.delete(key);
            }
        }
    }
    memoryCounters.set(windowKey, { count: 1, windowEnd });
    return 1;
}

/**
 * Fixed-window counter: checked in memory first, then stored in MongoDB so the limit holds
 * across instances. Expired windows are removed by the TTL index. If the database is
 * unreachable, callers fail closed because per-instance counters cannot enforce a shared limit.
 */
export async function consumeRateLimit(
    key: string,
    limit: number,
    windowMs: number,
): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowEnd = windowStart + windowMs;
    const retryAfterSeconds = Math.ceil((windowEnd - now) / 1000);
    const windowKey = `${key}:${windowStart}`;

    if (consumeMemory(windowKey, windowEnd, now) > limit) return { allowed: false, retryAfterSeconds };

    try {
        await connectDB({ skipCommitteeSeed: true });
        const increment = () =>
            RateLimit.findOneAndUpdate(
                { key: windowKey },
                { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
                { upsert: true, returnDocument: "after" },
            ).lean<{ count: number }>();

        let entry;
        try {
            entry = await increment();
        } catch (error) {
            // Two concurrent upserts for a new window can collide; the retry updates the winner.
            if (!isDuplicateKeyError(error)) throw error;
            entry = await increment();
        }

        return { allowed: (entry?.count ?? 0) <= limit, retryAfterSeconds };
    } catch (error) {
        console.error("Rate limit store unavailable:", error);
        return { allowed: false, retryAfterSeconds: 0, unavailable: true };
    }
}

/** Applies every rule in order and stops at the first one that is exceeded. */
export async function consumeRateLimits(rules: RateLimitRule[]): Promise<RateLimitResult> {
    for (const rule of rules) {
        const result = await consumeRateLimit(rule.key, rule.limit, rule.windowMs);
        if (!result.allowed) return result;
    }
    return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitedResponse(retryAfterSeconds: number, error = "Too many requests. Please wait a while and try again."): Response {
    if (retryAfterSeconds === 0) {
        return Response.json(
            { success: false, error: "Request protection is temporarily unavailable. Please try again shortly.", code: "RATE_LIMIT_UNAVAILABLE" },
            { status: 503, headers: { "Retry-After": "10" } },
        );
    }
    return Response.json(
        { success: false, error, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
}
