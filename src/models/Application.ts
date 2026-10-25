import mongoose, { Schema } from "mongoose";

export const PARTICIPANT_TYPES = ["solo", "delegation"] as const;
export const APPLICATION_STATUSES = [
    "Submitted",
    "Payment under review",
    "Payment confirmed",
    "Committee allocated",
    "Waitlisted",
    "Action Required",
] as const;

export interface IApplication {
    applicationId: string;
    participantType: (typeof PARTICIPANT_TYPES)[number];
    institution?: string;
    status: (typeof APPLICATION_STATUSES)[number];
    contactName?: string;
    contactEmail?: string;
    contactWhatsapp?: string;
    headIsDelegate?: boolean;
    idempotencyKey?: string;
    createdAt: Date;
    updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
    {
        applicationId: { type: String, required: true, trim: true },
        participantType: { type: String, enum: PARTICIPANT_TYPES, required: true },
        institution: {
            type: String,
            required: function (this: IApplication) {
                return this.participantType === "delegation";
            },
            trim: true,
        },
        status: {
            type: String,
            enum: APPLICATION_STATUSES,
            default: "Submitted",
            required: true,
        },
        contactName: { type: String, trim: true },
        contactEmail: { type: String, lowercase: true, trim: true },
        contactWhatsapp: { type: String, trim: true },
        headIsDelegate: { type: Boolean },
        idempotencyKey: { type: String, trim: true },
    },
    { timestamps: true },
);

applicationSchema.index({ applicationId: 1 }, { unique: true });

const Application =
    mongoose.models.Application ??
    mongoose.model<IApplication>("Application", applicationSchema);

export default Application;
