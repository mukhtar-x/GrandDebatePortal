import connectDB from "@/lib/db";
import { DEFAULT_COMMITTEE_OPTIONS, type CommitteeOption } from "@/lib/committeeDefaults";
import Committee from "@/models/Committee";

export async function getCommitteeOptions(): Promise<CommitteeOption[]> {
    try {
        await connectDB();
        const committees = await Committee.find({ active: true })
            .select("-_id code name agenda suitedTo level totalSeats studyGuideUrl active")
            .sort({ code: 1 })
            .lean<CommitteeOption[]>();

        return committees.length > 0 ? committees : DEFAULT_COMMITTEE_OPTIONS;
    } catch (error) {
        console.error("Committee lookup failed; using default committee options:", error);
        return DEFAULT_COMMITTEE_OPTIONS;
    }
}
