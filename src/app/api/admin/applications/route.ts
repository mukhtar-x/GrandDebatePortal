import { requireAdmin } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import { escapeRegex, isOneOf } from "@/lib/validation";
import Application, { APPLICATION_STATUSES, PARTICIPANT_TYPES } from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

const PAGE_SIZE = 50;
const PAYMENT_STATUSES = ["Pending", "Confirmed", "Action Required"] as const;

/**
 * Query: status, type, paymentStatus, q (searches ID, contact, institution), page (1-based).
 * Newest first.
 */
export async function GET(request: Request): Promise<Response> {
    const auth = requireAdmin(request);
    if (auth.response) return auth.response;

    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const type = params.get("type");
    const paymentStatus = params.get("paymentStatus");
    const q = params.get("q")?.trim().slice(0, 100) ?? "";
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

    const match: Record<string, unknown> = {};
    if (isOneOf(APPLICATION_STATUSES, status)) match.status = status;
    if (isOneOf(PARTICIPANT_TYPES, type)) match.participantType = type;
    if (q) {
        const pattern = { $regex: escapeRegex(q), $options: "i" };
        match.$or = [
            { applicationId: pattern },
            { contactEmail: pattern },
            { contactName: pattern },
            { institution: pattern },
        ];
    }

    try {
        await connectDB();
        const [result] = await Application.aggregate<{ items: unknown[]; total: { count: number }[] }>([
            { $match: match },
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: Payment.collection.name,
                    localField: "applicationId",
                    foreignField: "applicationId",
                    as: "payment",
                    pipeline: [
                        {
                            $project: {
                                _id: 0,
                                paymentStatus: 1,
                                totalPayable: 1,
                                rateType: 1,
                                transactionId: 1,
                                receiptUrl: 1,
                                receiptMime: 1,
                                reviewReason: 1,
                                reviewedAt: 1,
                                reviewedBy: 1,
                                receiptEditingSoftware: 1,
                                analysis: 1,
                            },
                        },
                    ],
                },
            },
            { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
            ...(isOneOf(PAYMENT_STATUSES, paymentStatus)
                ? [{ $match: { "payment.paymentStatus": paymentStatus } }]
                : []),
            {
                $lookup: {
                    from: Delegate.collection.name,
                    localField: "applicationId",
                    foreignField: "applicationId",
                    as: "delegates",
                    pipeline: [
                        {
                            $project: {
                                fullName: 1,
                                email: 1,
                                assignedCommittee: 1,
                                assignedPortfolio: 1,
                                delegateStatus: 1,
                                isHead: 1,
                            },
                        },
                    ],
                },
            },
            { $project: { idempotencyKey: 0, __v: 0 } },
            {
                $facet: {
                    items: [{ $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE }],
                    total: [{ $count: "count" }],
                },
            },
        ]);

        return Response.json({
            success: true,
            page,
            pageSize: PAGE_SIZE,
            total: result?.total[0]?.count ?? 0,
            applications: result?.items ?? [],
        });
    } catch (error) {
        console.error("Admin application list failed:", error);
        return Response.json({ success: false, error: "Applications could not be loaded." }, { status: 500 });
    }
}
