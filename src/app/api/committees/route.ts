import { getCommitteeOptions } from "@/lib/committeeOptions";

export async function GET(): Promise<Response> {
    const committees = await getCommitteeOptions();
    return Response.json({
        success: true,
        committees: committees.map((committee) => ({
            ...committee,
            studyGuideStatus: committee.studyGuideUrl ? "Available" : "Coming soon",
        })),
    });
}
