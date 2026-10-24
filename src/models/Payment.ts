import mongoose, { Schema } from "mongoose";

export interface IPayment {
    applicationId: string;
    totalPayable: number;
    rateType: "Early bird" | "Regular";
    receiptUrl: string;
    transactionId?: string;
    paymentStatus: "Pending" | "Confirmed" | "Action Required";
    reviewReason?: string;
    reviewedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
    {
        applicationId: { type: String, required: true, unique: true },
        totalPayable: { type: Number, required: true, min: 0 },
        rateType: { type: String, enum: ["Early bird", "Regular"], required: true },
        receiptUrl: { type: String, required: true, trim: true },
        transactionId: { type: String, trim: true },
        paymentStatus: {
            type: String,
            enum: ["Pending", "Confirmed", "Action Required"],
            default: "Pending",
            required: true,
        },
        reviewReason: { type: String, trim: true },
        reviewedAt: { type: Date },
    },
    { timestamps: true },
);

const Payment = mongoose.models.Payment ?? mongoose.model<IPayment>("Payment", paymentSchema);

export default Payment;
