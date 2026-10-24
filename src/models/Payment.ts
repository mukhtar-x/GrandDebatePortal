import mongoose, { Schema } from "mongoose";

export interface IReceiptHistoryEntry {
    receiptUrl: string;
    receiptFileId?: string;
    receiptSha256?: string;
    transactionId?: string;
    reviewReason?: string;
    replacedAt: Date;
}

export interface IPayment {
    applicationId: string;
    totalPayable: number;
    rateType: "Early bird" | "Regular";
    receiptUrl: string;
    transactionId?: string;
    paymentStatus: "Pending" | "Confirmed" | "Action Required";
    reviewReason?: string;
    reviewedAt?: Date;
    reviewedBy?: string;
    receiptFileId?: string;
    receiptMime?: string;
    receiptSha256?: string;
    receiptDhash?: string | null;
    receiptEditingSoftware?: string | null;
    receiptHistory?: IReceiptHistoryEntry[];
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
        reviewedBy: { type: String, trim: true },
        receiptFileId: { type: String },
        receiptMime: { type: String },
        receiptSha256: { type: String },
        receiptDhash: { type: String, default: null },
        receiptEditingSoftware: { type: String, default: null },
        receiptHistory: {
            type: [
                {
                    _id: false,
                    receiptUrl: { type: String, required: true },
                    receiptFileId: { type: String },
                    receiptSha256: { type: String },
                    transactionId: { type: String },
                    reviewReason: { type: String },
                    replacedAt: { type: Date, required: true },
                },
            ],
            default: undefined,
        },
    },
    { timestamps: true },
);

const Payment = mongoose.models.Payment ?? mongoose.model<IPayment>("Payment", paymentSchema);

export default Payment;
