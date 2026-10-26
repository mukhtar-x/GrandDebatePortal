import { connection } from "next/server";
import { getCommitteeOptions } from "@/lib/committeeOptions";

export async function GET(): Promise<Response> {
    await connection();
    const committees = await getCommitteeOptions();
    return Response.json({ success: true, committees });
}
