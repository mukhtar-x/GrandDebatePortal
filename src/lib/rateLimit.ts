import connectDB from "@/lib/db";
import RateLimit from "@/models/RateLimit";

export interface RateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
}

function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

/**
 * Fixed-window counter stored in MongoDB. Expired windows are removed by the TTL index.
 * Fails open: if the database is unreachable the request is allowed and the error logged.
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

    try {
        await connectDB({ skipCommitteeSeed: true });
        const increment = () =>
            RateLimit.findOneAndUpdate(
                { key: windowKey },
                { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
                { upsert: true, new: true },
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
        console.error("Rate limit check failed; allowing request:", error);
        return { allowed: true, retryAfterSeconds: 0 };
    }
}

export function rateLimitedResponse(retryAfterSeconds: number): Response {
    return Response.json(
        { success: false, error: "Too many requests. Please wait a while and try again." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
}
