import mongoose, { Schema } from "mongoose";

export interface IAdminAuditLog {
    actorId: string;
    actorName: string;
    action: string;
    method: string;
    path: string;
    createdAt: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
    {
        actorId: { type: String, required: true, lowercase: true, trim: true },
        actorName: { type: String, required: true, trim: true },
        action: { type: String, required: true, trim: true },
        method: { type: String, required: true, trim: true },
        path: { type: String, required: true, trim: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });

const AdminAuditLog = mongoose.models.AdminAuditLog ?? mongoose.model<IAdminAuditLog>("AdminAuditLog", adminAuditLogSchema);
export default AdminAuditLog;
