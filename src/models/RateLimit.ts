import mongoose, { Schema } from "mongoose";

export interface IRateLimit {
    key: string;
    count: number;
    expiresAt: Date;
}

const rateLimitSchema = new Schema<IRateLimit>({
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true, expires: 0 },
});

const RateLimit =
    mongoose.models.RateLimit ?? mongoose.model<IRateLimit>("RateLimit", rateLimitSchema);

export default RateLimit;
