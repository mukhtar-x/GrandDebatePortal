import { requireAdminMutation } from "@/lib/adminAuth";
import { analyzeReceipt } from "@/lib/receipts/analyze";

export const maxDuration = 60;

/** Runs the receipt checks again and returns the fresh result. */
export async function POST(
    request: Request,
    ctx: RouteContext<"/api/admin/payments/[applicationId]/reanalyze">,
): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();
    try {
        const analysis = await analyzeReceipt(applicationId);
        if (!analysis) {
            return Response.json({ success: false, error: "No uploaded receipt found for this application." }, { status: 404 });
        }
        return Response.json({ success: true, applicationId, analysis });
    } catch (error) {
        console.error("Receipt re-analysis failed:", error);
        return Response.json({ success: false, error: "Receipt could not be analysed." }, { status: 500 });
    }
}
