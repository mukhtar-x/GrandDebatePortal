import { adminSessionCookie, checkAdminPassword, isAdminConfigured } from "@/lib/adminAuth";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { getClientIp, readJsonBody, rejectCrossOrigin } from "@/lib/requestGuards";
import { MAX_LENGTHS, isRecord, normalizeString } from "@/lib/validation";

/** Body: { password, name } — name identifies the organiser in review records. */
export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    if (!isAdminConfigured()) {
        return Response.json({ success: false, error: "Admin access is not configured." }, { status: 503 });
    }

    const limit = await consumeRateLimit(`admin-login:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const body = await readJsonBody(request);
    const password = isRecord(body) && typeof body.password === "string" ? body.password : "";
    const name = isRecord(body) ? normalizeString(body.name) : undefined;

    if (typeof name !== "string" || !name || name.length > MAX_LENGTHS.name) {
        return Response.json({ success: false, error: "Please enter your name." }, { status: 400 });
    }
    if (!checkAdminPassword(password)) {
        return Response.json({ success: false, error: "Incorrect password." }, { status: 401 });
    }

    return Response.json(
        { success: true, name },
        { headers: { "Set-Cookie": adminSessionCookie(name) } },
    );
}
