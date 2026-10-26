import mongoose, { Schema } from "mongoose";
import { MAX_DELEGATION_SIZE, MIN_DELEGATION_SIZE } from "@/data/event";

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
    /** Persisted count used to validate delegation size; optional for legacy records. */
    delegateCount?: number;
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
        delegateCount: {
            type: Number,
            required: true,
            min: 1,
            max: MAX_DELEGATION_SIZE,
            validate: {
                validator(value: number) {
                    return (
                        value === 1 ||
                        (Number.isInteger(value) &&
                            value >= MIN_DELEGATION_SIZE &&
                            value <= MAX_DELEGATION_SIZE)
                    );
                },
                message: `Applications must have one solo delegate or between ${MIN_DELEGATION_SIZE} and ${MAX_DELEGATION_SIZE} delegation members.`,
            },
        },
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

applicationSchema.pre("validate", function validateParticipantCount() {
    const validCount =
        this.participantType === "solo"
            ? this.delegateCount === 1
            : Number.isInteger(this.delegateCount) &&
                (this.delegateCount ?? 0) >= MIN_DELEGATION_SIZE &&
                (this.delegateCount ?? 0) <= MAX_DELEGATION_SIZE;

    if (!validCount) {
        this.invalidate(
            "delegateCount",
            `Solo applications require one delegate; delegations require between ${MIN_DELEGATION_SIZE} and ${MAX_DELEGATION_SIZE}.`,
        );
    }
});

applicationSchema.index({ applicationId: 1 }, { unique: true });

const Application =
    mongoose.models.Application ??
    mongoose.model<IApplication>("Application", applicationSchema);

export default Application;
