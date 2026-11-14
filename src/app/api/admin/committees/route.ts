import { requireAdmin, requireAdminMutation } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import { DEFAULT_COMMITTEE_OPTIONS } from "@/lib/committeeDefaults";
import { readJsonBody } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { escapeRegex, isRecord, normalizeString } from "@/lib/validation";
import Application from "@/models/Application";
import Committee from "@/models/Committee";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

export async function GET(request: Request): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        await connectDB();
        const [storedCommittees, allocations, unallocatedDelegates, allocatedDelegates] = await Promise.all([
            Committee.find().select("-_id code name agenda suitedTo level totalSeats studyGuideUrl active").sort({ code: 1 }).lean(),
            Delegate.aggregate<{ _id: string; count: number }>([
                { $match: { assignedCommittee: { $type: "string", $ne: "" } } },
                { $group: { _id: "$assignedCommittee", count: { $sum: 1 } } },
            ]),
            Delegate.aggregate<{
                _id: string;
                applicationId: string;
                fullName: string;
                email: string;
                experienceLevel?: string;
                additionalInfo?: string;
                firstPreference: string;
                secondPreference: string;
                institution?: string;
            }>([
                { $match: { $or: [{ assignedCommittee: null }, { assignedCommittee: { $exists: false } }] } },
                {
                    $lookup: {
                        from: Payment.collection.name,
                        localField: "applicationId",
                        foreignField: "applicationId",
                        as: "payment",
                        pipeline: [{ $match: { paymentStatus: "Confirmed" } }, { $project: { _id: 1 } }],
                    },
                },
                { $match: { "payment.0": { $exists: true } } },
                { $sort: { createdAt: 1 } },
                { $limit: 100 },
                {
                    $lookup: {
                        from: Application.collection.name,
                        localField: "applicationId",
                        foreignField: "applicationId",
                        as: "application",
                        pipeline: [{ $project: { institution: 1 } }],
                    },
                },
                { $unwind: { path: "$application", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        fullName: 1,
                        email: 1,
                        applicationId: 1,
                        experienceLevel: 1,
                        additionalInfo: 1,
                        firstPreference: 1,
                        secondPreference: 1,
                        institution: "$application.institution",
                    },
                },
            ]),
            Delegate.aggregate([
                { $match: { assignedCommittee: { $type: "string", $ne: "" } } },
                { $sort: { assignedCommittee: 1, fullName: 1 } },
                {
                    $lookup: {
                        from: Application.collection.name,
                        localField: "applicationId",
                        foreignField: "applicationId",
                        as: "application",
                        pipeline: [{ $project: { baCode: 1, participantType: 1, institution: 1 } }],
                    },
                },
                { $unwind: { path: "$application", preserveNullAndEmptyArrays: false } },
                {
                    $project: {
                        fullName: 1,
                        email: 1,
                        whatsappNumber: 1,
                        experienceLevel: 1,
                        firstPreference: 1,
                        secondPreference: 1,
                        assignedCommittee: 1,
                        assignedPortfolio: 1,
                        delegateStatus: 1,
                        isHead: 1,
                        applicationId: 1,
                        baCode: "$application.baCode",
                        participantType: "$application.participantType",
                        institution: "$application.institution",
                    },
                },
            ]),
        ]);
        const committeeList = storedCommittees.length ? storedCommittees : DEFAULT_COMMITTEE_OPTIONS;
        const allocatedByCode = new Map(allocations.map(({ _id, count }) => [_id, count]));

        return Response.json({
            success: true,
            committees: committeeList.map((committee) => ({
                ...committee,
                allocatedSeats: allocatedByCode.get(committee.code) ?? 0,
            })),
            unallocatedDelegates: unallocatedDelegates.map((delegate) => ({
                id: String(delegate._id),
                applicationId: delegate.applicationId,
                fullName: delegate.fullName,
                email: delegate.email,
                experienceLevel: delegate.experienceLevel,
                additionalInfo: delegate.additionalInfo,
                institution: delegate.institution,
                firstPreference: delegate.firstPreference,
                secondPreference: delegate.secondPreference,
            })),
            allocatedDelegates: allocatedDelegates.map((delegate) => ({
                ...delegate,
                id: String(delegate._id),
            })),
        });
    } catch (error) {
        console.error("Admin committee data failed:", error);
        return Response.json({ success: false, error: "Committee allocation data could not be loaded." }, { status: 500 });
    }
}

export async function POST(request: Request): Promise<Response> {
    const auth = await requireAdminMutation(request);
    if (auth.response) return auth.response;

    const body = await readJsonBody(request);
    if (!isRecord(body)) {
        return Response.json({ success: false, error: "Request body must be a JSON object." }, { status: 400 });
    }

    const code = normalizeString(body.code);
    const name = normalizeString(body.name);
    const agenda = normalizeString(body.agenda) || "To be announced";
    const suitedTo = normalizeString(body.suitedTo) || "All delegates";
    const level = normalizeString(body.level) || "All levels";
    const totalSeats = typeof body.totalSeats === "number" ? body.totalSeats : 0;
    const studyGuideUrl = typeof body.studyGuideUrl === "string" ? normalizeString(body.studyGuideUrl) : "";

    if (typeof code !== "string" || !code || code.length > 20) {
        return Response.json({ success: false, error: "Committee code is required (max 20 characters)." }, { status: 400 });
    }
    if (typeof name !== "string" || !name || name.length > 150) {
        return Response.json({ success: false, error: "Committee name is required (max 150 characters)." }, { status: 400 });
    }

    try {
        await connectDB();
        const created = await withTransaction(async (session) => {
            const existing = await Committee.findOne({
                code: new RegExp("^" + escapeRegex(code) + "$", "i"),
            }).session(session);

            if (existing) {
                throw new Error("A committee with this code already exists.");
            }

            const [doc] = await Committee.create(
                [
                    {
                        code: code.toUpperCase(),
                        name,
                        agenda,
                        suitedTo,
                        level,
                        totalSeats,
                        ...(studyGuideUrl ? { studyGuideUrl } : {}),
                        active: true,
                    },
                ],
                { session },
            );
            return doc;
        });

        return Response.json({ success: true, committee: created }, { status: 201 });
    } catch (error) {
        console.error("Committee creation failed:", error);
        const msg = error instanceof Error ? error.message : "Committee could not be created.";
        return Response.json({ success: false, error: msg }, { status: 400 });
    }
}
