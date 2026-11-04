import { requireAdmin } from "@/lib/adminAuth";
import { loadChallanHistories } from "@/lib/challanHistory";
import connectDB from "@/lib/db";

/** Full issue history of one challan number: everyone who held it, when, and how it ended. */
export async function GET(
    request: Request,
    ctx: RouteContext<"/api/admin/challans/[challanNumber]">,
): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const challanNumber = (await ctx.params).challanNumber.trim();
    if (!/^[A-Za-z0-9-]{4,40}$/.test(challanNumber)) {
        return Response.json({ success: false, error: "Enter a valid challan number." }, { status: 400 });
    }

    try {
        await connectDB({ skipCommitteeSeed: true });
        const [history] = await loadChallanHistories([challanNumber]);
        if (!history.environment && history.issues.length === 0) {
            return Response.json({ success: false, error: `Challan ${challanNumber} was not found.` }, { status: 404 });
        }
        return Response.json({ success: true, challan: history });
    } catch (error) {
        console.error("Challan history lookup failed:", error);
        return Response.json({ success: false, error: "Challan history could not be loaded." }, { status: 500 });
    }
}
