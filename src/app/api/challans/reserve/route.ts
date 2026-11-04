import { createHash } from "node:crypto";
import connectDB from "@/lib/db";
import { CHALLAN_ENVIRONMENT, CHALLAN_GRACE_MS, CHALLAN_RESERVATION_MS, createReservationToken, getChallanDetails, registrationFingerprint } from "@/lib/challans";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { getClientIp, readJsonBody, rejectCrossOrigin } from "@/lib/requestGuards";
import { isRecord, normalizeEmail, recursiveSanitize } from "@/lib/validation";
import Challan from "@/models/Challan";
import { ensureTestChallanPool } from "@/lib/testChallanPool";

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const limit = await consumeRateLimit(`challan-reserve:${getClientIp(request)}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
    const body = await readJsonBody(request);
    if (!isRecord(body) || !isRecord(body.registration)) {
        return Response.json({ success: false, error: "Complete your registration details before generating a challan." }, { status: 400 });
    }
    const registration = recursiveSanitize(body.registration);
    if (!isRecord(registration)) return Response.json({ success: false, error: "Delegate details are incomplete." }, { status: 400 });
    const delegates = registration.delegates;
    const participantType = registration.participantType;
    if (!Array.isArray(delegates)) return Response.json({ success: false, error: "Delegate details are incomplete." }, { status: 400 });
    const details = getChallanDetails(participantType, delegates.length);
    if (!details) return Response.json({ success: false, error: "Registration type or delegate count is invalid." }, { status: 400 });
    const requiredFields = ["fullName", "email", "whatsappNumber", "experienceLevel", "firstPreference", "secondPreference"];
    if (typeof registration.institution !== "string" || !registration.institution.trim()) {
        return Response.json({ success: false, error: "Complete the institution field before generating a challan." }, { status: 400 });
    }
    for (const [index, value] of delegates.entries()) {
        if (!isRecord(value) || requiredFields.some((field) => typeof value[field] !== "string" || !value[field]?.trim())) {
            return Response.json({ success: false, error: `Complete delegate ${index + 1}'s details before generating a challan.` }, { status: 400 });
        }
        if (value.firstPreference === value.secondPreference) {
            return Response.json({ success: false, error: `Delegate ${index + 1}'s committee preferences must be different.` }, { status: 400 });
        }
    }
    if (participantType === "delegation" && ["headName", "headEmail", "headWhatsapp"].some((field) => typeof registration[field] !== "string" || !String(registration[field]).trim())) {
        return Response.json({ success: false, error: "Complete the head delegate contact details before generating a challan." }, { status: 400 });
    }
    const contactEmail = normalizeEmail(participantType === "solo" ? (delegates[0] as Record<string, unknown>)?.email : registration.headEmail);
    if (!contactEmail) return Response.json({ success: false, error: "Enter a valid contact email before generating a challan." }, { status: 400 });
    const fingerprint = registrationFingerprint(registration);
    const contactHash = createHash("sha256").update(contactEmail).digest("hex");
    const now = new Date();
    const token = createReservationToken();

    try {
        await connectDB({ skipCommitteeSeed: true });
        if (CHALLAN_ENVIRONMENT === "test") await ensureTestChallanPool();
        await Challan.updateMany({ environment: CHALLAN_ENVIRONMENT, status: { $in: ["Reserved", "Expired"] }, graceUntil: { $lte: now } }, {
            $set: { status: "Available" },
            $unset: { reservationTokenHash: 1, registrationFingerprint: 1, reservationContactHash: 1, reservedAt: 1, expiresAt: 1, graceUntil: 1 },
        });
        const existing = await Challan.findOne({
            environment: CHALLAN_ENVIRONMENT,
            reservationContactHash: contactHash,
            status: "Reserved",
            graceUntil: { $gt: now },
        }).select("challanNumber amount rateType expiresAt graceUntil registrationFingerprint").lean();
        if (existing) {
            return Response.json({ success: false, error: "An active challan is already reserved for this email. Continue that registration or wait for its grace period to end." }, { status: 409 });
        }
        const challan = await Challan.findOneAndUpdate({
            environment: CHALLAN_ENVIRONMENT,
            category: details.category,
            rateType: details.rateType,
            amount: details.totalPayable,
            $or: [
                { status: "Available" },
            ],
        }, {
            $set: {
                status: "Reserved",
                reservationTokenHash: token.tokenHash,
                registrationFingerprint: fingerprint,
                reservationContactHash: contactHash,
                reservedAt: now,
                expiresAt: new Date(now.getTime() + CHALLAN_RESERVATION_MS),
                graceUntil: new Date(now.getTime() + CHALLAN_RESERVATION_MS + CHALLAN_GRACE_MS),
            },
        }, { sort: { challanNumber: 1 }, returnDocument: "after" }).lean();
        if (!challan) return Response.json({ success: false, error: "No challans are currently available for this registration amount. Please contact the organisers." }, { status: 409 });
        return Response.json({
            success: true,
            reservationToken: token.token,
            challanNumber: challan.challanNumber,
            amount: challan.amount,
            rateType: challan.rateType,
            category: challan.category,
            expiresAt: challan.expiresAt,
            graceUntil: challan.graceUntil,
            test: CHALLAN_ENVIRONMENT === "test",
        });
    } catch (error) {
        if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
            return Response.json({ success: false, error: "A challan is already reserved for this email. Continue that registration or try after its grace period." }, { status: 409 });
        }
        console.error("Challan reservation failed:", error);
        return Response.json({ success: false, error: "A challan could not be reserved. Please try again." }, { status: 500 });
    }
}

export async function DELETE(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    let body: unknown;
    try { body = await request.json(); } catch { body = null; }
    if (!isRecord(body) || typeof body.reservationToken !== "string") return Response.json({ success: false }, { status: 400 });
    const tokenHash = createHash("sha256").update(body.reservationToken).digest("hex");
    try {
        await connectDB({ skipCommitteeSeed: true });
        await Challan.updateOne({ environment: CHALLAN_ENVIRONMENT, reservationTokenHash: tokenHash, status: "Reserved" }, {
            $set: { status: "Expired" },
            $unset: { reservationTokenHash: 1, registrationFingerprint: 1, reservationContactHash: 1, reservedAt: 1, expiresAt: 1 },
        });
        return Response.json({ success: true });
    } catch (error) {
        console.error("Challan release failed:", error);
        return Response.json({ success: false }, { status: 500 });
    }
}
