import { connection } from "next/server";
import { getCommitteeOptions } from "@/lib/committeeOptions";

export async function GET(): Promise<Response> {
    // Read at request time so organiser edits (agenda, seats, study guides) appear immediately.
    await connection();
    const committees = await getCommitteeOptions();
    return Response.json({
        success: true,
        committees: committees.map((committee) => ({
            ...committee,
            studyGuideStatus: committee.studyGuideUrl ? "Available" : "Coming soon",
        })),
    });
}
