import mongoose, { Schema, type Types } from "mongoose";

export const CHALLAN_CATEGORIES = ["solo", "delegation-4", "delegation-5", "delegation-6", "delegation-7"] as const;
export type ChallanCategory = (typeof CHALLAN_CATEGORIES)[number];
export type ChallanRate = "Early bird" | "Regular";

/**
 * Available: never issued. Reserved: held by an applicant until graceUntil.
 * Expired: released early by the applicant; still held until graceUntil.
 * Submitted: used by an application; never issued again.
 * A Reserved or Expired challan whose graceUntil has passed can be issued again.
 */
export interface IChallan {
    challanNumber: string;
    environment: "test" | "live";
    category: ChallanCategory;
    rateType: ChallanRate;
    amount: number;
    status: "Available" | "Reserved" | "Expired" | "Submitted";
    /** How many times this challan has been given to an applicant; unused challans are issued first. */
    issueCount: number;
    /** The ChallanIssue record of the latest holder. */
    currentIssueId?: Types.ObjectId;
    reservationTokenHash?: string;
    registrationFingerprint?: string;
    reservationContactHash?: string;
    reservedAt?: Date;
    expiresAt?: Date;
    /** Kept after a reservation ends; reuse starts with the challan released longest ago. */
    graceUntil?: Date;
    applicationId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const challanSchema = new Schema<IChallan>({
    challanNumber: { type: String, required: true, trim: true, unique: true },
    environment: { type: String, enum: ["test", "live"], required: true },
    category: { type: String, enum: CHALLAN_CATEGORIES, required: true },
    rateType: { type: String, enum: ["Early bird", "Regular"], required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["Available", "Reserved", "Expired", "Submitted"], default: "Available", required: true },
    issueCount: { type: Number, default: 0, min: 0, required: true },
    currentIssueId: { type: Schema.Types.ObjectId, ref: "ChallanIssue" },
    reservationTokenHash: { type: String, select: false },
    registrationFingerprint: { type: String, select: false },
    reservationContactHash: { type: String, select: false },
    reservedAt: Date,
    expiresAt: Date,
    graceUntil: Date,
    applicationId: { type: String, trim: true },
}, { timestamps: true });

// Serves the issue order: unused first, then least reused, then released longest ago.
challanSchema.index({ environment: 1, category: 1, rateType: 1, issueCount: 1, graceUntil: 1, challanNumber: 1 });
challanSchema.index({ environment: 1, category: 1, rateType: 1, status: 1, challanNumber: 1 });
challanSchema.index({ reservationTokenHash: 1 }, { unique: true, sparse: true });
challanSchema.index({ reservationContactHash: 1 }, { unique: true, partialFilterExpression: { status: "Reserved" } });

const Challan = mongoose.models.Challan ?? mongoose.model<IChallan>("Challan", challanSchema);
export default Challan;
