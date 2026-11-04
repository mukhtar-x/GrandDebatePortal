import connectDB from "@/lib/db";
import { DEFAULT_COMMITTEE_OPTIONS } from "@/lib/committeeDefaults";
import Committee from "@/models/Committee";
import Delegate from "@/models/Delegate";

export async function seedCommittees(): Promise<void> {
    await connectDB({ skipCommitteeSeed: true });
    const legacyCommittee = await Committee.findOne({ code: "SOCHUM" }).lean<{ code: string }>();
    if (legacyCommittee) {
        const pacExists = await Committee.exists({ code: "PAC" });
        await Delegate.updateMany({ firstPreference: "SOCHUM" }, { $set: { firstPreference: "PAC" } });
        await Delegate.updateMany({ secondPreference: "SOCHUM" }, { $set: { secondPreference: "PAC" } });
        await Delegate.updateMany({ assignedCommittee: "SOCHUM" }, { $set: { assignedCommittee: "PAC" } });
        if (pacExists) {
            await Committee.updateOne({ code: "SOCHUM" }, { $set: { active: false } });
        } else {
            await Committee.updateOne(
                { code: "SOCHUM" },
                { $set: { code: "PAC", name: "Pakistan Aurat Council" }, $unset: { studyGuideUrl: 1 } },
            );
        }
    }
    await Committee.bulkWrite(
        DEFAULT_COMMITTEE_OPTIONS.flatMap((committee) => [
            {
                updateOne: {
                    filter: { code: committee.code },
                    update: { $setOnInsert: committee },
                    upsert: true,
                },
            },
            {
                updateOne: {
                    filter: { code: committee.code, active: { $exists: false } },
                    update: { $set: { active: true } },
                },
            },
            {
                updateOne: {
                    filter: { code: committee.code, totalSeats: { $exists: false } },
                    update: { $set: { totalSeats: committee.totalSeats } },
                },
            },
        ]),
    );
}
