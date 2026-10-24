import connectDB from "@/lib/db";
import { DEFAULT_COMMITTEE_OPTIONS } from "@/lib/committeeDefaults";
import Committee from "@/models/Committee";

export async function seedCommittees(): Promise<void> {
    await connectDB({ skipCommitteeSeed: true });
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
