import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: Request): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    return Response.json({
        success: true,
        name: auth.session.name,
        expiresAt: new Date(auth.session.expiresAt).toISOString(),
    });
}
