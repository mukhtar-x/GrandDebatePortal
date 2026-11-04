import { requireAdmin } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";

/** BA reporting is derived from the application code and each delegate's live allocation. */
export async function GET(request: Request): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        await connectDB();
        const [ambassadors, allocations] = await Promise.all([
            Application.aggregate([
                { $match: { baCode: { $type: "string", $ne: "" } } },
                {
                    $lookup: {
                        from: Delegate.collection.name,
                        localField: "applicationId",
                        foreignField: "applicationId",
                        as: "delegates",
                        pipeline: [{ $project: { assignedCommittee: 1 } }],
                    },
                },
                {
                    $group: {
                        _id: { $toUpper: { $trim: { input: "$baCode" } } },
                        soloApplications: { $sum: { $cond: [{ $eq: ["$participantType", "solo"] }, 1, 0] } },
                        delegationApplications: { $sum: { $cond: [{ $eq: ["$participantType", "delegation"] }, 1, 0] } },
                        soloDelegates: { $sum: { $cond: [{ $eq: ["$participantType", "solo"] }, { $size: "$delegates" }, 0] } },
                        delegationDelegates: { $sum: { $cond: [{ $eq: ["$participantType", "delegation"] }, { $size: "$delegates" }, 0] } },
                        allocatedDelegates: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: "$delegates",
                                        as: "delegate",
                                        cond: { $and: [{ $ne: ["$$delegate.assignedCommittee", null] }, { $ne: ["$$delegate.assignedCommittee", ""] }] },
                                    },
                                },
                            },
                        },
                    },
                },
                { $sort: { _id: 1 } },
                {
                    $project: {
                        _id: 0,
                        code: "$_id",
                        soloApplications: 1,
                        delegationApplications: 1,
                        soloDelegates: 1,
                        delegationDelegates: 1,
                        allocatedDelegates: 1,
                    },
                },
            ]),
            Delegate.aggregate([
                { $match: { assignedCommittee: { $type: "string", $ne: "" } } },
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
                    $group: {
                        _id: { committee: "$assignedCommittee", baCode: { $ifNull: [{ $toUpper: { $trim: { input: "$application.baCode" } } }, ""] } },
                        delegates: { $sum: 1 },
                    },
                },
                { $project: { _id: 0, committee: "$_id.committee", baCode: "$_id.baCode", delegates: 1 } },
            ]),
        ]);

        return Response.json({ success: true, ambassadors, allocations });
    } catch (error) {
        console.error("Brand ambassador report failed:", error);
        return Response.json({ success: false, error: "Brand ambassador data could not be loaded." }, { status: 500 });
    }
}
