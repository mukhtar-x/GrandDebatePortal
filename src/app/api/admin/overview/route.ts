import { requireAdmin } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

export async function GET(request: Request): Promise<Response> {
    const auth = requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        await connectDB();
        const [soloApplications, delegationApplications, totalDelegates, paymentGroups] = await Promise.all([
            Application.countDocuments({ participantType: "solo" }),
            Application.countDocuments({ participantType: "delegation" }),
            Delegate.countDocuments(),
            Payment.aggregate<{ _id: string; count: number; revenue: number }>([
                {
                    $group: {
                        _id: "$paymentStatus",
                        count: { $sum: 1 },
                        revenue: {
                            $sum: {
                                $cond: [{ $eq: ["$paymentStatus", "Confirmed"] }, "$totalPayable", 0],
                            },
                        },
                    },
                },
            ]),
        ]);
        const paymentCounts = { pending: 0, verified: 0, actionRequired: 0 };
        let totalRevenue = 0;
        for (const group of paymentGroups) {
            if (group._id === "Pending") paymentCounts.pending = group.count;
            if (group._id === "Confirmed") {
                paymentCounts.verified = group.count;
                totalRevenue += group.revenue;
            }
            if (group._id === "Action Required") paymentCounts.actionRequired = group.count;
        }

        return Response.json({
            success: true,
            metrics: {
                totalApplications: soloApplications + delegationApplications,
                soloApplications,
                delegationApplications,
                totalDelegates,
                paymentCounts,
                totalRevenue,
            },
        });
    } catch (error) {
        console.error("Admin overview failed:", error);
        return Response.json({ success: false, error: "Dashboard metrics could not be loaded." }, { status: 500 });
    }
}
