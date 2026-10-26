import { adminSessionCookie, authenticateAdmin, createAdminSession, isAdminConfigured } from "@/lib/adminAuth";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { getClientIp, readJsonBody, rejectCrossOrigin } from "@/lib/requestGuards";
import { isRecord } from "@/lib/validation";

/** Body: { userId, password } — identity comes from the server-side organiser allowlist. */
export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    if (!isAdminConfigured()) {
        return Response.json({ success: false, error: "Admin access is not configured." }, { status: 503 });
    }

    const limit = await consumeRateLimit(`admin-login:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    const body = await readJsonBody(request);
    const userId = isRecord(body) && typeof body.userId === "string" ? body.userId.trim().toLowerCase() : "";
    const password = isRecord(body) && typeof body.password === "string" ? body.password : "";

    if (!userId || !/^[a-zA-Z0-9_-]{3,50}$/.test(userId)) {
        return Response.json({ success: false, error: "Enter a valid organiser user ID." }, { status: 400 });
    }
    const user = await authenticateAdmin(userId, password);
    if (!user) {
        return Response.json({ success: false, error: "Incorrect password." }, { status: 401 });
    }

    try {
        const session = await createAdminSession(user);
        return Response.json(
            { success: true, name: user.name },
            { headers: { "Set-Cookie": adminSessionCookie(session.token) } },
        );
    } catch (error) {
        console.error("Admin session could not be created:", error);
        return Response.json({ success: false, error: "Admin sign-in is temporarily unavailable." }, { status: 503 });
    }
}
