import mongoose from "mongoose";
import { requireAdminMutation } from "@/lib/adminAuth";
import { canonicalCommittee, syncApplicationStatus } from "@/lib/allocation";
import { readJsonBody } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { MAX_LENGTHS, escapeRegex, isRecord, normalizeString } from "@/lib/validation";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

class AllocationError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string,
    ) {
        super(message);
    }
}

function errorResponse(error: unknown, fallback: string): Response {
    if (error instanceof AllocationError) {
        return Response.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error(`${fallback}:`, error);
    return Response.json({ success: false, error: fallback }, { status: 500 });
}

async function delegateId(ctx: RouteContext<"/api/admin/delegates/[id]/allocate">) {
    const { id } = await ctx.params;
    return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

/**
 * Body: { committee, portfolio }. Requires a confirmed payment. Enforces the committee's seat
 * count (when set above 0) and one delegate per portfolio within a committee.
 */
export async function POST(
    request: Request,
    ctx: RouteContext<"/api/admin/delegates/[id]/allocate">,
): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const id = await delegateId(ctx);
    if (!id) return Response.json({ success: false, error: "Delegate not found." }, { status: 404 });

    const body = await readJsonBody(request);
    const portfolio = isRecord(body) ? normalizeString(body.portfolio) : undefined;
    const committee = await canonicalCommittee(isRecord(body) ? body.committee : undefined);
    if (!committee) {
        return Response.json({ success: false, error: "Please choose a valid committee." }, { status: 400 });
    }
    if (typeof portfolio !== "string" || !portfolio || portfolio.length > MAX_LENGTHS.portfolio) {
        return Response.json({ success: false, error: "Please enter a country or portfolio." }, { status: 400 });
    }

    try {
        const delegate = await withTransaction(async (session) => {
            const current = await Delegate.findById(id).session(session);
            if (!current) throw new AllocationError("Delegate not found.", 404, "NOT_FOUND");

            const payment = await Payment.findOne({ applicationId: current.applicationId })
                .select("paymentStatus")
                .session(session)
                .lean<{ paymentStatus: string }>();
            if (payment?.paymentStatus !== "Confirmed") {
                throw new AllocationError("Confirm the payment before allocating a committee.", 409, "PAYMENT_NOT_CONFIRMED");
            }

            if (committee.totalSeats > 0) {
                const taken = await Delegate.countDocuments({ assignedCommittee: committee.code, _id: { $ne: id } }).session(
                    session,
                );
                if (taken >= committee.totalSeats) {
                    throw new AllocationError(`${committee.code} is full (${committee.totalSeats} seats).`, 409, "COMMITTEE_FULL");
                }
            }

            const portfolioTaken = await Delegate.exists({
                _id: { $ne: id },
                assignedCommittee: committee.code,
                assignedPortfolio: { $regex: `^${escapeRegex(portfolio)}$`, $options: "i" },
            }).session(session);
            if (portfolioTaken) {
                throw new AllocationError(`${portfolio} is already assigned in ${committee.code}.`, 409, "PORTFOLIO_TAKEN");
            }

            current.assignedCommittee = committee.code;
            current.assignedPortfolio = portfolio;
            current.delegateStatus = "Active";
            await current.save({ session });
            await syncApplicationStatus(current.applicationId, session);
            return current;
        });

        return Response.json({
            success: true,
            delegateId: delegate._id,
            applicationId: delegate.applicationId,
            assignedCommittee: delegate.assignedCommittee,
            assignedPortfolio: delegate.assignedPortfolio,
        });
    } catch (error) {
        return errorResponse(error, "Allocation could not be saved");
    }
}

/** Removes a delegate's allocation (e.g. to reassign them or before rejecting a payment). */
export async function DELETE(
    request: Request,
    ctx: RouteContext<"/api/admin/delegates/[id]/allocate">,
): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const id = await delegateId(ctx);
    if (!id) return Response.json({ success: false, error: "Delegate not found." }, { status: 404 });

    try {
        await withTransaction(async (session) => {
            const current = await Delegate.findById(id).session(session);
            if (!current) throw new AllocationError("Delegate not found.", 404, "NOT_FOUND");
            current.assignedCommittee = null;
            current.assignedPortfolio = null;
            current.delegateStatus = "Active";
            await current.save({ session });
            await syncApplicationStatus(current.applicationId, session);
        });
        return Response.json({ success: true });
    } catch (error) {
        return errorResponse(error, "Allocation could not be removed");
    }
}
