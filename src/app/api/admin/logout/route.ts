import { clearAdminSessionCookie, revokeAdminSession } from "@/lib/adminAuth";
import { rejectCrossOrigin } from "@/lib/requestGuards";

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    try {
        await revokeAdminSession(request);
        return Response.json({ success: true }, { headers: { "Set-Cookie": clearAdminSessionCookie() } });
    } catch (error) {
        console.error("Admin session could not be revoked:", error);
        return Response.json({ success: false, error: "Admin sign-out is temporarily unavailable." }, { status: 503 });
    }
}
