import Challan from "@/models/Challan";
import ChallanIssue, { challanIssueStatus, type IChallanIssue } from "@/models/ChallanIssue";

export interface ChallanHistory {
    challanNumber: string;
    environment?: "test" | "live";
    category?: string;
    rateType?: string;
    amount?: number;
    status?: string;
    issueCount: number;
    applicationId?: string;
    /** True when more than one applicant has held this challan. */
    reused: boolean;
    issues: Array<{
        issueNumber: number;
        status: string;
        contactName: string;
        contactEmail: string;
        contactWhatsapp: string;
        institution: string;
        participantType: string;
        delegateCount: number;
        baCode?: string;
        reservedAt: Date;
        graceUntil: Date;
        endedAt?: Date;
        applicationId?: string;
        linkedApplicationId?: string;
    }>;
}

/** Every recorded holder of each challan number, oldest first. */
export async function loadChallanHistories(challanNumbers: string[]): Promise<ChallanHistory[]> {
    const numbers = [...new Set(challanNumbers.filter(Boolean))];
    if (numbers.length === 0) return [];
    const [challans, issues] = await Promise.all([
        Challan.find({ challanNumber: { $in: numbers } })
            .select("-_id challanNumber environment category rateType amount status issueCount applicationId")
            .lean<Array<{ challanNumber: string; environment: "test" | "live"; category: string; rateType: string; amount: number; status: string; issueCount?: number; applicationId?: string }>>(),
        ChallanIssue.find({ challanNumber: { $in: numbers } })
            .sort({ reservedAt: 1 })
            .select("-_id -ipHash -draftId -__v")
            .lean<IChallanIssue[]>(),
    ]);
    const now = new Date();
    return numbers.map((challanNumber) => {
        const challan = challans.find((item) => item.challanNumber === challanNumber);
        const own = issues.filter((issue) => issue.challanNumber === challanNumber);
        const holders = new Set(own.map((issue) => issue.contactEmail));
        return {
            challanNumber,
            ...(challan ? {
                environment: challan.environment,
                category: challan.category,
                rateType: challan.rateType,
                amount: challan.amount,
                status: challan.status,
                applicationId: challan.applicationId,
            } : {}),
            issueCount: challan?.issueCount ?? own.length,
            reused: holders.size > 1,
            issues: own.map((issue) => ({
                issueNumber: issue.issueNumber,
                status: challanIssueStatus(issue, now),
                contactName: issue.contactName,
                contactEmail: issue.contactEmail,
                contactWhatsapp: issue.contactWhatsapp,
                institution: issue.institution,
                participantType: issue.participantType,
                delegateCount: issue.delegateEmails.length,
                baCode: issue.baCode,
                reservedAt: issue.reservedAt,
                graceUntil: issue.graceUntil,
                endedAt: issue.endedAt,
                applicationId: issue.applicationId,
                linkedApplicationId: issue.linkedApplicationId,
            })),
        };
    });
}
