import mongoose, { Schema } from "mongoose";

export const EXPERIENCE_LEVELS = [
    "None",
    "1 to 3 conferences",
    "4 or more",
    "Chair or EB",
] as const;

export interface IDelegate {
    applicationId: string;
    fullName: string;
    email: string;
    whatsappNumber: string;
    experienceLevel: (typeof EXPERIENCE_LEVELS)[number];
    additionalInfo?: string;
    firstPreference: string;
    secondPreference: string;
    assignedCommittee?: string | null;
    assignedPortfolio?: string | null;
    delegateStatus: "Active" | "Waitlisted";
    createdAt: Date;
    updatedAt: Date;
}

const delegateSchema = new Schema<IDelegate>(
    {
        applicationId: {
            type: String,
            ref: "Application",
            required: true,
        },
        fullName: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        whatsappNumber: { type: String, required: true, trim: true },
        experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, required: true },
        additionalInfo: { type: String, trim: true },
        firstPreference: { type: String, required: true, trim: true },
        secondPreference: { type: String, required: true, trim: true },
        assignedCommittee: { type: String, default: null },
        assignedPortfolio: { type: String, default: null },
        delegateStatus: {
            type: String,
            enum: ["Active", "Waitlisted"],
            default: "Active",
            required: true,
        },
    },
    { timestamps: true },
);

delegateSchema.index({ applicationId: 1, email: 1 });

const Delegate =
    mongoose.models.Delegate ?? mongoose.model<IDelegate>("Delegate", delegateSchema);

export default Delegate;
