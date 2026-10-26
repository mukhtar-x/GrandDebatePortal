import mongoose, { Schema } from "mongoose";

export interface IAdminSession {
    tokenHash: string;
    userId: string;
    name: string;
    credentialVersion: string;
    expiresAt: Date;
    revokedAt?: Date;
    createdAt: Date;
}

const adminSessionSchema = new Schema<IAdminSession>(
    {
        tokenHash: { type: String, required: true, unique: true },
        userId: { type: String, required: true, lowercase: true, trim: true, index: true },
        name: { type: String, required: true, trim: true },
        credentialVersion: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AdminSession = mongoose.models.AdminSession ?? mongoose.model<IAdminSession>("AdminSession", adminSessionSchema);
export default AdminSession;
