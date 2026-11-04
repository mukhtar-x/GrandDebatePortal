import mongoose, { Schema } from "mongoose";

/** A short-lived per-device write lock serializes reservation-cap checks. */
const challanDeviceGateSchema = new Schema({
    deviceHash: { type: String, required: true, unique: true },
    version: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
}, { timestamps: true });

challanDeviceGateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ChallanDeviceGate = mongoose.models.ChallanDeviceGate ?? mongoose.model("ChallanDeviceGate", challanDeviceGateSchema);
export default ChallanDeviceGate;
