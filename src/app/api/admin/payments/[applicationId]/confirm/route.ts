import { after } from "next/server";
import { requireAdminMutation } from "@/lib/adminAuth";
import { notifyContact } from "@/lib/mailer";
import { withTransaction } from "@/lib/transaction";
import Application from "@/models/Application";
import Payment from "@/models/Payment";

class NotFoundError extends Error {}

export async function POST(
    request: Request,
    ctx: RouteContext<"/api/admin/payments/[applicationId]/confirm">,
): Promise<Response> {
    const auth = await requireAdminMutation(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();

    try {
        await withTransaction(async (session) => {
            const payment = await Payment.findOneAndUpdate(
                { applicationId },
                {
                    $set: { paymentStatus: "Confirmed", reviewedAt: new Date(), reviewedBy: auth.session.name },
                    $unset: { reviewReason: "" },
                },
                { session },
            );
            if (!payment) throw new NotFoundError();

            // Allocation progress is kept if a payment is re-confirmed later.
            await Application.updateOne(
                { applicationId, status: { $in: ["Submitted", "Payment under review", "Action Required"] } },
                { $set: { status: "Payment confirmed" } },
                { session },
            );
        });
        after(() => notifyContact(applicationId, { type: "paymentConfirmed" }));
        return Response.json({ success: true, applicationId, paymentStatus: "Confirmed" });
    } catch (error) {
        if (error instanceof NotFoundError) {
            return Response.json({ success: false, error: "Payment not found." }, { status: 404 });
        }
        console.error("Payment confirmation failed:", error);
        return Response.json({ success: false, error: "Payment could not be confirmed." }, { status: 500 });
    }
}
