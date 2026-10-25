import mongoose from "mongoose";
import { after } from "next/server";
import { requireAdminMutation } from "@/lib/adminAuth";
import { syncApplicationStatus } from "@/lib/allocation";
import { notifyDelegate } from "@/lib/mailer";
import { withTransaction } from "@/lib/transaction";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

class WaitlistError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

/** Places a delegate on the waitlist, clearing any allocation. Requires a confirmed payment. */
export async function POST(
    request: Request,
    ctx: RouteContext<"/api/admin/delegates/[id]/waitlist">,
): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) {
        return Response.json({ success: false, error: "Delegate not found." }, { status: 404 });
    }

    try {
        await withTransaction(async (session) => {
            const delegate = await Delegate.findById(id).session(session);
            if (!delegate) throw new WaitlistError("Delegate not found.", 404);

            const payment = await Payment.findOne({ applicationId: delegate.applicationId })
                .select("paymentStatus")
                .session(session)
                .lean<{ paymentStatus: string }>();
            if (payment?.paymentStatus !== "Confirmed") {
                throw new WaitlistError("Confirm the payment before waitlisting a delegate.", 409);
            }

            delegate.assignedCommittee = null;
            delegate.assignedPortfolio = null;
            delegate.delegateStatus = "Waitlisted";
            await delegate.save({ session });
            await syncApplicationStatus(delegate.applicationId, session);
        });
        after(() => notifyDelegate(id, { type: "waitlisted" }));
        return Response.json({ success: true, delegateStatus: "Waitlisted" });
    } catch (error) {
        if (error instanceof WaitlistError) {
            return Response.json({ success: false, error: error.message }, { status: error.status });
        }
        console.error("Waitlisting failed:", error);
        return Response.json({ success: false, error: "Delegate could not be waitlisted." }, { status: 500 });
    }
}
