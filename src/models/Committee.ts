import mongoose, { Schema } from "mongoose";

export interface ICommittee {
    code: string;
    name: string;
    agenda: string;
    suitedTo: string;
    level: string;
    totalSeats: number;
    studyGuideUrl?: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const committeeSchema = new Schema<ICommittee>(
    {
        code: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true },
        agenda: { type: String, default: "To be announced", required: true },
        suitedTo: { type: String, required: true, trim: true },
        level: { type: String, required: true, trim: true },
        totalSeats: { type: Number, required: true, default: 0, min: 0 },
        studyGuideUrl: { type: String, trim: true },
        active: { type: Boolean, required: true, default: true, index: true },
    },
    { timestamps: true },
);

const Committee =
    mongoose.models.Committee ?? mongoose.model<ICommittee>("Committee", committeeSchema);

export default Committee;
