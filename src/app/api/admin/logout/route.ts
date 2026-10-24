import { clearAdminSessionCookie } from "@/lib/adminAuth";
import { rejectCrossOrigin } from "@/lib/requestGuards";

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    return Response.json({ success: true }, { headers: { "Set-Cookie": clearAdminSessionCookie() } });
}
