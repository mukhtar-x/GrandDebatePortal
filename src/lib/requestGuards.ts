/**
 * Vercel replaces any client-sent X-Forwarded-For with the real client address, so the first
 * entry is trustworthy there. Behind other proxies, make sure they overwrite the header too.
 */
export function getClientIp(request: Request): string {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const first = forwardedFor.split(",")[0]?.trim();
        if (first) return first;
    }
    return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Rejects browser requests sent from another site. Requests without an Origin header
 * (server-to-server tools) are allowed, since CSRF only applies to browsers.
 */
export function rejectCrossOrigin(request: Request): Response | null {
    const origin = request.headers.get("origin");
    if (!origin) return null;

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
        originHost = new URL(origin).host;
    } catch {
        originHost = null;
    }

    if (host && originHost === host) return null;
    return Response.json({ success: false, error: "Cross-origin request rejected." }, { status: 403 });
}

/** Hidden form field that real users leave empty; bots tend to fill every input. */
export function isHoneypotFilled(value: unknown): boolean {
    return typeof value === "string" && value.trim() !== "";
}

export const DEFAULT_JSON_BODY_BYTES = 64 * 1024;

/** Reads the body as text, stopping as soon as it exceeds maxBytes; null when it is too large. */
async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return null;
    if (!request.body) return "";
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
}

/** Parses a JSON body, returning undefined when it is missing, malformed or larger than maxBytes. */
export async function readJsonBody(request: Request, maxBytes = DEFAULT_JSON_BODY_BYTES): Promise<unknown> {
    try {
        const text = await readLimitedText(request, maxBytes);
        return text === null ? undefined : JSON.parse(text);
    } catch {
        return undefined;
    }
}
