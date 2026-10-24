import { NOT_FOUND_MESSAGE, buildPortalStatus, credentialsFromBody, findPortalAccess } from "@/lib/portal";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { getClientIp, rejectCrossOrigin } from "@/lib/requestGuards";

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const limit = await consumeRateLimit(`status:${getClientIp(request)}`, 30, 60 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const credentials = credentialsFromBody(body);
    if (!credentials) {
        return Response.json(
            { success: false, error: "A valid email and applicationId are required." },
            { status: 400 },
        );
    }

    try {
        const access = await findPortalAccess(credentials.email, credentials.applicationId);
        if (!access) {
            return Response.json({ success: false, error: NOT_FOUND_MESSAGE }, { status: 404 });
        }
        return Response.json(await buildPortalStatus(access));
    } catch (error) {
        console.error("Application status lookup failed:", error);
        return Response.json(
            { success: false, error: "Application status could not be retrieved. Please try again." },
            { status: 500 },
        );
    }
}
