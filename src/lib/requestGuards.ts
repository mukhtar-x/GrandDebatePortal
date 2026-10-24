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

/** Parses a JSON body, returning undefined when it is missing or malformed. */
export async function readJsonBody(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}
