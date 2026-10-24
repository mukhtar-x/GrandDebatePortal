import connectDB from "@/lib/db";
import { firstName, isRecord, normalizeEmail } from "@/lib/validation";
import Application, { type IApplication } from "@/models/Application";
import Committee from "@/models/Committee";
import Delegate, { type IDelegate } from "@/models/Delegate";
import Payment, { type IPayment } from "@/models/Payment";

export const NOT_FOUND_MESSAGE =
    "No application was found with the details provided. Please check your entries and try again.";

export type StatusKey =
    | "submitted"
    | "payment-review"
    | "payment-confirmed"
    | "allocated"
    | "action-required"
    | "waitlisted";

const STATUS_KEY_BY_STATUS: Record<IApplication["status"], StatusKey> = {
    Submitted: "submitted",
    "Payment under review": "payment-review",
    "Payment confirmed": "payment-confirmed",
    "Committee allocated": "allocated",
    Waitlisted: "waitlisted",
    "Action Required": "action-required",
};

const STAGE_BY_KEY: Record<StatusKey, number> = {
    submitted: 1,
    "payment-review": 2,
    "action-required": 2,
    "payment-confirmed": 3,
    allocated: 4,
    waitlisted: 4,
};

type ApplicationRecord = Pick<
    IApplication,
    "applicationId" | "participantType" | "status" | "contactName" | "contactEmail" | "institution"
>;
type DelegateRecord = Pick<
    IDelegate,
    | "fullName"
    | "email"
    | "assignedCommittee"
    | "assignedPortfolio"
    | "delegateStatus"
    | "isHead"
> & { _id: unknown };
type PaymentRecord = Pick<IPayment, "paymentStatus" | "reviewReason" | "totalPayable" | "rateType">;

export interface PortalAccess {
    application: ApplicationRecord;
    delegates: DelegateRecord[];
    payment: PaymentRecord | null;
    viewerDelegate: DelegateRecord | null;
    /** The solo delegate or the head delegate: may see every delegate and act on the payment. */
    isContact: boolean;
}

export function parsePortalCredentials(
    email: unknown,
    applicationId: unknown,
): { email: string; applicationId: string } | null {
    const normalizedEmail = normalizeEmail(email);
    const normalizedId =
        typeof applicationId === "string" ? applicationId.trim().toUpperCase() : "";
    if (!normalizedEmail || !normalizedId || normalizedId.length > 40) return null;
    return { email: normalizedEmail, applicationId: normalizedId };
}

export function credentialsFromBody(body: unknown) {
    return isRecord(body) ? parsePortalCredentials(body.email, body.applicationId) : null;
}

/** Looks up an application that the given email belongs to (contact or any delegate). */
export async function findPortalAccess(email: string, applicationId: string): Promise<PortalAccess | null> {
    await connectDB();
    const application = await Application.findOne({ applicationId })
        .select("-_id applicationId participantType status contactName contactEmail institution")
        .lean<ApplicationRecord>();
    if (!application) return null;

    const delegates = await Delegate.find({ applicationId })
        .select("fullName email assignedCommittee assignedPortfolio delegateStatus isHead")
        .sort({ isHead: -1, createdAt: 1 })
        .lean<DelegateRecord[]>();

    const viewerDelegate = delegates.find((delegate) => delegate.email === email) ?? null;
    // Applications created before contact fields existed fall back to their only delegate.
    const contactEmail =
        application.contactEmail ??
        (application.participantType === "solo" ? delegates[0]?.email : undefined);
    const isContact = contactEmail === email;
    if (!isContact && !viewerDelegate) return null;

    const payment = await Payment.findOne({ applicationId })
        .select("-_id paymentStatus reviewReason totalPayable rateType")
        .lean<PaymentRecord>();

    return { application, delegates, payment, viewerDelegate, isContact };
}

function delegateStatusLabel(delegate: DelegateRecord, applicationStatus: IApplication["status"]): string {
    if (delegate.delegateStatus === "Waitlisted") return "Waitlisted";
    if (delegate.assignedCommittee) return "Allocated";
    return applicationStatus;
}

function stageMessage(
    key: StatusKey,
    reason: string | null,
    committee: string | null,
    portfolio: string | null,
): string {
    switch (key) {
        case "submitted":
            return "Your registration has been received. Thank you.";
        case "payment-review":
            return "Your payment is being reviewed. Once it is confirmed, your committee will be allocated within 1 to 3 business days.";
        case "payment-confirmed":
            return "You are confirmed as a delegate. Your committee will be allocated within 1 to 3 business days.";
        case "allocated":
            return committee
                ? `You have been allocated to ${committee}${portfolio ? `, representing ${portfolio}` : ""}.`
                : "Committees have been allocated for your delegation.";
        case "action-required":
            return `We were unable to verify your payment${reason ? `: ${reason}` : ""}. Please upload a new screenshot below, and your payment will be reviewed again.`;
        case "waitlisted":
            return "Your preferred committee is currently full, and you have been placed on the waitlist. This page will be updated as soon as a seat becomes available. No further action is required.";
    }
}

/** Builds the portal status payload shown to the signed-in applicant. */
export async function buildPortalStatus(access: PortalAccess) {
    const { application, delegates, payment, viewerDelegate, isContact } = access;

    let statusKey = STATUS_KEY_BY_STATUS[application.status] ?? "submitted";
    if (payment?.paymentStatus === "Action Required") statusKey = "action-required";

    // A delegate sees their own allocation even while the rest of the delegation is pending.
    if (viewerDelegate && statusKey !== "action-required") {
        if (viewerDelegate.delegateStatus === "Waitlisted") statusKey = "waitlisted";
        else if (viewerDelegate.assignedCommittee) statusKey = "allocated";
    }

    const committeeCode = viewerDelegate?.assignedCommittee ?? null;
    const portfolio = viewerDelegate?.assignedPortfolio ?? null;
    const committee = committeeCode
        ? await Committee.findOne({ code: committeeCode })
              .select("-_id code name studyGuideUrl")
              .lean<{ code: string; name: string; studyGuideUrl?: string }>()
        : null;

    const actionReason = statusKey === "action-required" ? (payment?.reviewReason ?? null) : null;
    const viewerName = viewerDelegate?.fullName ?? application.contactName ?? "";
    const visibleDelegates = isContact ? delegates : viewerDelegate ? [viewerDelegate] : [];

    return {
        success: true,
        applicationId: application.applicationId,
        firstName: firstName(viewerName),
        type: application.participantType,
        institution: application.institution ?? null,
        isHeadView: isContact,
        status: application.status,
        statusKey,
        stage: STAGE_BY_KEY[statusKey],
        message: stageMessage(statusKey, actionReason, committee?.name ?? committeeCode, portfolio),
        actionReason,
        canResubmitReceipt: isContact && statusKey === "action-required",
        committee: committeeCode,
        committeeName: committee?.name ?? null,
        portfolio,
        studyGuideUrl: committee?.studyGuideUrl ?? null,
        payment: isContact && payment
            ? { totalPayable: payment.totalPayable, rateType: payment.rateType, status: payment.paymentStatus }
            : null,
        delegates: application.participantType === "delegation"
            ? visibleDelegates.map((delegate) => ({
                  name: delegate.fullName,
                  committee: delegate.assignedCommittee ?? null,
                  portfolio: delegate.assignedPortfolio ?? null,
                  status: delegateStatusLabel(delegate, application.status),
                  isHead: delegate.isHead === true,
              }))
            : undefined,
    };
}
