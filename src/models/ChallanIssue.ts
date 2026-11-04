import mongoose, { Schema, type Types } from "mongoose";
import { CHALLAN_CATEGORIES, type ChallanCategory, type ChallanRate } from "@/models/Challan";

/**
 * Stored status. "Active" past its 30-minute reservation is reported as "Expired" by
 * challanIssueStatus; it is not rewritten, so the record keeps the exact times.
 */
export const CHALLAN_ISSUE_STATUSES = ["Active", "Released", "Superseded", "Submitted"] as const;
export type ChallanIssueStatus = (typeof CHALLAN_ISSUE_STATUSES)[number];

/** One record per time a challan number was given to an applicant. Never deleted. */
export interface IChallanIssue {
    _id: Types.ObjectId;
    challanNumber: string;
    environment: "test" | "live";
    category: ChallanCategory;
    rateType: ChallanRate;
    amount: number;
    /** 1 for the first time this challan number was given out, 2 for the next, and so on. */
    issueNumber: number;
    participantType: "solo" | "delegation";
    institution: string;
    contactName: string;
    contactEmail: string;
    contactWhatsapp: string;
    delegateEmails: string[];
    baCode?: string;
    /** Random id the browser keeps for one form fill; links every challan generated during it. */
    draftId?: string;
    ipHash: string;
    /** Opaque first-party browser identifier used for the concurrent reservation cap. */
    deviceHash?: string;
    status: ChallanIssueStatus;
    reservedAt: Date;
    /** Last moment the applicant could submit with this challan. */
    expiresAt: Date;
    /** When the challan could go back into the pool (15 minutes after expiresAt). */
    graceUntil: Date;
    endedAt?: Date;
    /** Set when this challan was submitted with the application. */
    applicationId?: string;
    /** Set when a different challan was submitted, by the same applicant, after this one. */
    linkedApplicationId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const challanIssueSchema = new Schema<IChallanIssue>({
    challanNumber: { type: String, required: true, trim: true },
    environment: { type: String, enum: ["test", "live"], required: true },
    category: { type: String, enum: CHALLAN_CATEGORIES, required: true },
    rateType: { type: String, enum: ["Early bird", "Regular"], required: true },
    amount: { type: Number, required: true, min: 1 },
    issueNumber: { type: Number, required: true, min: 1 },
    participantType: { type: String, enum: ["solo", "delegation"], required: true },
    institution: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactWhatsapp: { type: String, required: true, trim: true },
    delegateEmails: { type: [String], default: [] },
    baCode: { type: String, trim: true },
    draftId: { type: String, trim: true },
    ipHash: { type: String, required: true },
    deviceHash: { type: String },
    status: { type: String, enum: CHALLAN_ISSUE_STATUSES, default: "Active", required: true },
    reservedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    graceUntil: { type: Date, required: true },
    endedAt: Date,
    applicationId: { type: String, trim: true },
    linkedApplicationId: { type: String, trim: true },
}, { timestamps: true });

challanIssueSchema.index({ challanNumber: 1, reservedAt: 1 });
challanIssueSchema.index({ applicationId: 1 }, { sparse: true });
challanIssueSchema.index({ linkedApplicationId: 1 }, { sparse: true });
challanIssueSchema.index({ draftId: 1 }, { sparse: true });
challanIssueSchema.index({ contactEmail: 1, reservedAt: -1 });
challanIssueSchema.index({ ipHash: 1, status: 1, expiresAt: 1 });
challanIssueSchema.index({ deviceHash: 1, status: 1, expiresAt: 1 });

export function challanIssueStatus(issue: Pick<IChallanIssue, "status" | "expiresAt">, now = new Date()) {
    return issue.status === "Active" && new Date(issue.expiresAt) <= now ? "Expired" : issue.status;
}

const ChallanIssue = mongoose.models.ChallanIssue ?? mongoose.model<IChallanIssue>("ChallanIssue", challanIssueSchema);
export default ChallanIssue;
