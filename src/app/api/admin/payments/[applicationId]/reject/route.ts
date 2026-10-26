import { after } from "next/server";
import { requireAdminMutation } from "@/lib/adminAuth";
import { notifyContact } from "@/lib/mailer";
import { readJsonBody } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { MAX_LENGTHS, isRecord, normalizeString } from "@/lib/validation";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

class NotFoundError extends Error {}
class AlreadyAllocatedError extends Error {}

/**
 * Body: { reason } — shown to the applicant, e.g. "the screenshot was unclear".
 * Moves the application to "Action Required" so the head delegate can upload a new receipt.
 */
export async function POST(
    request: Request,
    ctx: RouteContext<"/api/admin/payments/[applicationId]/reject">,
): Promise<Response> {
    const auth = await requireAdminMutation(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();
    const body = await readJsonBody(request);
    const reason = isRecord(body) ? normalizeString(body.reason) : undefined;
    if (typeof reason !== "string" || reason.length < 3 || reason.length > MAX_LENGTHS.reason) {
        return Response.json(
            { success: false, error: "Please give a reason (3 to 500 characters)." },
            { status: 400 },
        );
    }

    try {
        await withTransaction(async (session) => {
            const allocated = await Delegate.exists({ applicationId, assignedCommittee: { $ne: null } }).session(
                session,
            );
            if (allocated) throw new AlreadyAllocatedError();

            const payment = await Payment.findOneAndUpdate(
                { applicationId },
                {
                    $set: {
                        paymentStatus: "Action Required",
                        reviewReason: reason,
                        reviewedAt: new Date(),
                        reviewedBy: auth.session.name,
                    },
                },
                { session },
            );
            if (!payment) throw new NotFoundError();

            await Application.updateOne({ applicationId }, { $set: { status: "Action Required" } }, { session });
        });
        after(() => notifyContact(applicationId, { type: "actionRequired", reason }));
        return Response.json({ success: true, applicationId, paymentStatus: "Action Required" });
    } catch (error) {
        if (error instanceof NotFoundError) {
            return Response.json({ success: false, error: "Payment not found." }, { status: 404 });
        }
        if (error instanceof AlreadyAllocatedError) {
            return Response.json(
                { success: false, error: "Delegates in this application are already allocated. Remove their allocations first." },
                { status: 409 },
            );
        }
        console.error("Payment rejection failed:", error);
        return Response.json({ success: false, error: "Payment could not be updated." }, { status: 500 });
    }
}
