import { requireAdmin } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

export async function GET(
    request: Request,
    ctx: RouteContext<"/api/admin/applications/[applicationId]">,
): Promise<Response> {
    const auth = requireAdmin(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();

    try {
        await connectDB();
        const application = await Application.findOne({ applicationId }).select("-__v -idempotencyKey").lean();
        if (!application) {
            return Response.json({ success: false, error: "Application not found." }, { status: 404 });
        }
        const [delegates, payment] = await Promise.all([
            Delegate.find({ applicationId }).select("-__v").sort({ isHead: -1, createdAt: 1 }).lean(),
            Payment.findOne({ applicationId }).select("-__v").lean(),
        ]);

        return Response.json({ success: true, application, delegates, payment });
    } catch (error) {
        console.error("Admin application lookup failed:", error);
        return Response.json({ success: false, error: "Application could not be loaded." }, { status: 500 });
    }
}
