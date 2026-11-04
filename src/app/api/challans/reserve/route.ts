import { getCommitteeOptions } from "@/lib/committeeOptions";
import connectDB from "@/lib/db";
import {
    CHALLAN_ENVIRONMENT,
    NoChallanAvailableError,
    createReservationToken,
    endReservation,
    getChallanDetails,
    hashSecret,
    issueChallan,
    registrationFingerprint,
    type ReservationView,
} from "@/lib/challans";
import { calculatePricing } from "@/lib/pricing";
import { consumeRateLimits, rateLimitedResponse } from "@/lib/rateLimit";
import { alreadyRegisteredResponse, parseRegistrationDetails } from "@/lib/registrationInput";
import { getClientIp, isHoneypotFilled, readJsonBody, rejectCrossOrigin } from "@/lib/requestGuards";
import { ensureTestChallanPool } from "@/lib/testChallanPool";
import { withTransaction } from "@/lib/transaction";
import { isRecord, normalizeString, recursiveSanitize } from "@/lib/validation";
import Challan from "@/models/Challan";
import ChallanIssue from "@/models/ChallanIssue";

const HOUR_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 32 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;
const DRAFT_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
/**
 * Challans one network may hold at once. Schools often share one IP, so this is a cap on
 * pool draining rather than a per-person limit.
 */
const MAX_ACTIVE_PER_IP = 5;

function reservationResponse(token: string, challan: ReservationView, resumed = false): Response {
    return Response.json({
        success: true,
        reservationToken: token,
        challanNumber: challan.challanNumber,
        amount: challan.amount,
        rateType: challan.rateType,
        category: challan.category,
        expiresAt: challan.expiresAt,
        graceUntil: challan.graceUntil,
        test: CHALLAN_ENVIRONMENT === "test",
        resumed,
    });
}

function pktTime(date: Date): string {
    return date.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
}

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const ip = getClientIp(request);
    const ipLimit = await consumeRateLimits([
        { key: `challan-reserve-burst:${ip}`, limit: 10, windowMs: 60 * 1000 },
        { key: `challan-reserve:${ip}`, limit: 20, windowMs: HOUR_MS },
    ]);
    if (!ipLimit.allowed) return rateLimitedResponse(ipLimit.retryAfterSeconds);

    const body = await readJsonBody(request, MAX_BODY_BYTES);
    if (!isRecord(body) || !isRecord(body.registration)) {
        return Response.json({ success: false, error: "Complete your registration details before generating a challan." }, { status: 400 });
    }
    if (isHoneypotFilled(body.website)) {
        return Response.json({ success: false, error: "A challan could not be reserved." }, { status: 400 });
    }

    const committees = await getCommitteeOptions();
    const parsed = parseRegistrationDetails(recursiveSanitize(body.registration), new Set(committees.map(({ code }) => code)));
    if (!parsed.success) {
        return Response.json({ success: false, error: parsed.error, ...(parsed.field ? { field: parsed.field } : {}) }, { status: 400 });
    }
    const details = parsed.value;
    const pricingResult = calculatePricing(details.delegates.length);
    if (!pricingResult.success) {
        const closed = pricingResult.code === "REGISTRATION_CLOSED";
        return Response.json({ success: false, error: pricingResult.error, code: pricingResult.code }, { status: closed ? 410 : 400 });
    }
    if (!getChallanDetails(details.participantType, details.delegates.length)) {
        return Response.json({ success: false, error: "Registration type or delegate count is invalid." }, { status: 400 });
    }

    const contactHash = hashSecret(details.contact.email);
    const emailLimit = await consumeRateLimits([{ key: `challan-reserve-email:${contactHash}`, limit: 8, windowMs: HOUR_MS }]);
    if (!emailLimit.allowed) {
        return rateLimitedResponse(emailLimit.retryAfterSeconds, "Too many challans were requested for this email. Please wait a while and try again.");
    }

    const draftId = normalizeString(body.draftId);
    const previousToken = normalizeString(body.previousReservationToken);
    const previousTokenHash = typeof previousToken === "string" && TOKEN_PATTERN.test(previousToken) ? hashSecret(previousToken) : null;
    const fingerprint = registrationFingerprint(details);
    const ipHash = hashSecret(`challan-ip:${ip}`);
    const token = createReservationToken();
    const now = new Date();

    try {
        await connectDB();
        if (CHALLAN_ENVIRONMENT === "test") await ensureTestChallanPool();

        // Checked before a challan is issued, so nobody pays for a registration that would be refused.
        const duplicate = await alreadyRegisteredResponse(details);
        if (duplicate) return duplicate;

        const held = await Challan.findOne({
            environment: CHALLAN_ENVIRONMENT,
            reservationContactHash: contactHash,
            status: "Reserved",
            graceUntil: { $gt: now },
        }).select("_id challanNumber amount rateType category expiresAt graceUntil +registrationFingerprint +reservationTokenHash")
            .lean<ReservationView & { _id: unknown; registrationFingerprint?: string; reservationTokenHash?: string }>();

        if (held && held.registrationFingerprint === fingerprint) {
            // Same person, same details (for example after a page refresh): hand back the same challan.
            const rotated = await Challan.updateOne(
                { _id: held._id, status: "Reserved", reservationTokenHash: held.reservationTokenHash },
                { $set: { reservationTokenHash: token.tokenHash } },
            );
            if (rotated.modifiedCount === 1) return reservationResponse(token.token, held, true);
        } else if (held && held.reservationTokenHash !== previousTokenHash) {
            return Response.json({
                success: false,
                error: `Challan ${held.challanNumber} is already reserved for this email with different details. Continue with that challan, or generate a new one after ${pktTime(new Date(held.graceUntil))}.`,
                code: "CHALLAN_HELD",
            }, { status: 409 });
        }

        const activeOnNetwork = await ChallanIssue.countDocuments({
            ipHash,
            status: "Active",
            graceUntil: { $gt: now },
            environment: CHALLAN_ENVIRONMENT,
        });
        if (activeOnNetwork >= MAX_ACTIVE_PER_IP + (previousTokenHash ? 1 : 0)) {
            return rateLimitedResponse(15 * 60, "Too many challans are currently reserved from this network. Please submit or wait for one to expire.");
        }

        const challan = await withTransaction(async (session) => {
            // Lets this email reserve again if its last reservation lapsed without being reclaimed.
            await Challan.updateMany(
                { environment: CHALLAN_ENVIRONMENT, reservationContactHash: contactHash, status: "Reserved", graceUntil: { $lte: now } },
                { $set: { status: "Expired" }, $unset: { reservationTokenHash: 1, registrationFingerprint: 1, reservationContactHash: 1 } },
                { session },
            );
            if (previousTokenHash) await endReservation(previousTokenHash, "Superseded", now, session);
            return issueChallan({
                details,
                pricing: pricingResult.pricing,
                fingerprint,
                contactHash,
                tokenHash: token.tokenHash,
                ipHash,
                ...(typeof draftId === "string" && DRAFT_ID_PATTERN.test(draftId) ? { draftId } : {}),
                now,
                session,
            });
        });
        return reservationResponse(token.token, challan);
    } catch (error) {
        if (error instanceof NoChallanAvailableError) {
            return Response.json({ success: false, error: "No challans are currently available for this registration amount. Please contact the organisers.", code: "NO_CHALLANS" }, { status: 409 });
        }
        if (isRecord(error) && error.code === 11000) {
            return Response.json({ success: false, error: "A challan is already being reserved for this email. Please wait a moment and try again.", code: "CHALLAN_HELD" }, { status: 409 });
        }
        console.error("Challan reservation failed:", error);
        return Response.json({ success: false, error: "A challan could not be reserved. Please try again." }, { status: 500 });
    }
}

/** Releases a reservation early (the applicant started over). */
export async function DELETE(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const limit = await consumeRateLimits([{ key: `challan-release:${getClientIp(request)}`, limit: 30, windowMs: HOUR_MS }]);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
    const body = await readJsonBody(request, 1024);
    if (!isRecord(body) || typeof body.reservationToken !== "string" || !TOKEN_PATTERN.test(body.reservationToken)) {
        return Response.json({ success: false }, { status: 400 });
    }
    try {
        await connectDB({ skipCommitteeSeed: true });
        await withTransaction((session) => endReservation(hashSecret(body.reservationToken as string), "Released", new Date(), session));
        return Response.json({ success: true });
    } catch (error) {
        console.error("Challan release failed:", error);
        return Response.json({ success: false }, { status: 500 });
    }
}
