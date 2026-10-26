import type { ClientSession } from "mongoose";
import { getCommitteeOptions } from "@/lib/committeeOptions";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";

export async function canonicalCommittee(value: unknown) {
    if (typeof value !== "string") return null;
    const committees = await getCommitteeOptions();
    return committees.find((committee) => committee.code.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

/**
 * Derives the application status from its delegates after an allocation change:
 * every delegate placed → "Committee allocated"; a waitlisted solo delegate → "Waitlisted";
 * otherwise an allocated or waitlisted application returns to "Payment confirmed".
 */
export async function syncApplicationStatus(applicationId: string, session: ClientSession): Promise<void> {
    const application = await Application.findOne({ applicationId }).session(session);
    if (!application) return;

    const delegates = await Delegate.find({ applicationId })
        .select("assignedCommittee delegateStatus")
        .session(session)
        .lean<{ assignedCommittee?: string | null; delegateStatus: string }[]>();

    let status = application.status;
    if (delegates.length > 0 && delegates.every((delegate) => delegate.assignedCommittee)) {
        status = "Committee allocated";
    } else if (application.participantType === "solo" && delegates[0]?.delegateStatus === "Waitlisted") {
        status = "Waitlisted";
    } else if (status === "Committee allocated" || status === "Waitlisted") {
        status = "Payment confirmed";
    }

    if (status !== application.status) {
        await Application.updateOne({ applicationId }, { $set: { status } }, { session });
    }
}
