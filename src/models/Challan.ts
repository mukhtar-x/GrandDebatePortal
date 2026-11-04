import mongoose, { Schema } from "mongoose";

export const CHALLAN_CATEGORIES = ["solo", "delegation-4", "delegation-5", "delegation-6", "delegation-7"] as const;
export type ChallanCategory = (typeof CHALLAN_CATEGORIES)[number];
export type ChallanRate = "Early bird" | "Regular";

export interface IChallan {
    challanNumber: string;
    environment: "test" | "live";
    category: ChallanCategory;
    rateType: ChallanRate;
    amount: number;
    status: "Available" | "Reserved" | "Expired" | "Submitted";
    reservationTokenHash?: string;
    registrationFingerprint?: string;
    reservationContactHash?: string;
    reservedAt?: Date;
    expiresAt?: Date;
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
    reservationTokenHash: { type: String, select: false },
    registrationFingerprint: { type: String, select: false },
    reservationContactHash: { type: String, select: false },
    reservedAt: Date,
    expiresAt: Date,
    graceUntil: Date,
    applicationId: { type: String, trim: true },
}, { timestamps: true });

challanSchema.index({ environment: 1, category: 1, rateType: 1, status: 1, challanNumber: 1 });
challanSchema.index({ reservationTokenHash: 1 }, { unique: true, sparse: true });
challanSchema.index({ reservationContactHash: 1 }, { unique: true, partialFilterExpression: { status: "Reserved" } });

const Challan = mongoose.models.Challan ?? mongoose.model<IChallan>("Challan", challanSchema);
export default Challan;
