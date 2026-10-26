import { requireAdmin } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import AdminAuditLog from "@/models/AdminAuditLog";

export async function GET(request: Request): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        await connectDB({ skipCommitteeSeed: true });
        const entries = await AdminAuditLog.find()
            .select("-__v")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        return Response.json({ success: true, entries });
    } catch (error) {
        console.error("Admin audit log could not be loaded:", error);
        return Response.json({ success: false, error: "Audit history could not be loaded." }, { status: 500 });
    }
}
