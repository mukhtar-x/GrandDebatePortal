import connectDB from "@/lib/db";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { getClientIp, rejectCrossOrigin } from "@/lib/requestGuards";
import Delegate from "@/models/Delegate";

interface StatusLookupResult {
    applicationId: string;
    applicationStatus: string | null;
    paymentStatus: string | null;
    actionRequiredReason: string | null;
    assignedCommittee: string | null;
    assignedPortfolio: string | null;
    delegateStatus: string;
}

const STAGE_BY_STATUS: Record<string, number> = {
    Submitted: 1,
    "Payment under review": 2,
    "Action Required": 2,
    "Payment confirmed": 3,
    "Committee allocated": 4,
    Waitlisted: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const limit = await consumeRateLimit(`status:${getClientIp(request)}`, 10, 60 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const email = isRecord(body) && typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";
    const applicationId =
        isRecord(body) && typeof body.applicationId === "string"
            ? body.applicationId.trim()
            : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !applicationId) {
        return Response.json(
            { success: false, error: "A valid email and applicationId are required." },
            { status: 400 },
        );
    }

    try {
        await connectDB();
        const [result] = await Delegate.aggregate<StatusLookupResult>([
            { $match: { applicationId, email } },
            {
                $lookup: {
                    from: "applications",
                    localField: "applicationId",
                    foreignField: "applicationId",
                    as: "application",
                },
            },
            {
                $lookup: {
                    from: "payments",
                    localField: "applicationId",
                    foreignField: "applicationId",
                    as: "payment",
                },
            },
            {
                $project: {
                    _id: 0,
                    applicationId: 1,
                    applicationStatus: { $arrayElemAt: ["$application.status", 0] },
                    paymentStatus: {
                        $ifNull: [{ $arrayElemAt: ["$payment.paymentStatus", 0] }, null],
                    },
                    actionRequiredReason: {
                        $ifNull: [{ $arrayElemAt: ["$payment.reviewReason", 0] }, null],
                    },
                    assignedCommittee: { $ifNull: ["$assignedCommittee", null] },
                    assignedPortfolio: { $ifNull: ["$assignedPortfolio", null] },
                    delegateStatus: { $ifNull: ["$delegateStatus", "Active"] },
                },
            },
            { $limit: 1 },
        ]);

        if (!result || !result.applicationStatus) {
            return Response.json(
                { success: false, error: "No application was found for that email and application ID." },
                { status: 404 },
            );
        }

        const stageStatus =
            result.paymentStatus === "Action Required"
                ? "Action Required"
                : result.applicationStatus;
        const stage = STAGE_BY_STATUS[stageStatus] ?? 1;
        return Response.json({
            success: true,
            applicationId: result.applicationId,
            status: result.applicationStatus,
            stage,
            paymentStatus: result.paymentStatus,
            assignedCommittee: result.assignedCommittee,
            assignedPortfolio: result.assignedPortfolio,
            delegateStatus: result.delegateStatus,
            actionRequiredReason:
                result.paymentStatus === "Action Required" ||
                result.applicationStatus === "Action Required"
                    ? result.actionRequiredReason
                    : null,
        });
    } catch (error) {
        console.error("Application status lookup failed:", error);
        return Response.json(
            { success: false, error: "Application status could not be retrieved. Please try again." },
            { status: 500 },
        );
    }
}
