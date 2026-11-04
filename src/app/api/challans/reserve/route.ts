import { getCommitteeOptions } from "@/lib/committeeOptions";
import { randomBytes } from "node:crypto";
import connectDB from "@/lib/db";
import {
    CHALLAN_ENVIRONMENT,
    NoChallanAvailableError,
    challanCategory,
    createReservationToken,
    endReservation,
    ensureDeviceGate,
    getChallanDetails,
    hashSecret,
    issueChallan,
    lockDeviceGate,
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
const DEVICE_COOKIE = "tgd_challan_device";
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;
/**
 * Concurrent challans one browser may hold. The IP request limits remain a separate abuse control.
 */
const MAX_ACTIVE_PER_DEVICE = 5;

class DeviceReservationLimitError extends Error {}

function reservationResponse(token: string, challan: ReservationView, deviceToken: string, resumed = false): Response {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
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
    }, { headers: { "Set-Cookie": `${DEVICE_COOKIE}=${deviceToken}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}` } });
}

function getDeviceToken(request: Request) {
    const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([^;]+)`));
    const existing = match?.[1];
    return typeof existing === "string" && DEVICE_TOKEN_PATTERN.test(existing) ? existing : randomBytes(32).toString("base64url");
}

function pktTime(date: Date): string {
    return date.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
}

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const ip = getClientIp(request);
    const deviceToken = getDeviceToken(request);
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
    const draftId = normalizeString(body.draftId);
    const previousToken = normalizeString(body.previousReservationToken);
    const previousTokenHash = typeof previousToken === "string" && TOKEN_PATTERN.test(previousToken) ? hashSecret(previousToken) : null;
    const fingerprint = registrationFingerprint(details);
    const ipHash = hashSecret(`challan-ip:${ip}`);
    const deviceHash = hashSecret(`challan-device:${deviceToken}`);
    const token = createReservationToken();
    const now = new Date();

    try {
        await connectDB();
        // Keep test inventory opt-in so a development request cannot recreate a test pool
        // in a database that has been intentionally cleared for live challans.
        if (CHALLAN_ENVIRONMENT === "test" && process.env.CHALLAN_MODE === "test") await ensureTestChallanPool();

        // Checked before a challan is issued, so nobody pays for a registration that would be refused.
        const duplicate = await alreadyRegisteredResponse(details);
        if (duplicate) return duplicate;

        const held = await Challan.findOne({
            environment: CHALLAN_ENVIRONMENT,
            reservationContactHash: contactHash,
            status: "Reserved",
            expiresAt: { $gt: now },
        }).select("_id challanNumber amount rateType category expiresAt graceUntil +registrationFingerprint +reservationTokenHash")
            .lean<ReservationView & { _id: unknown; registrationFingerprint?: string; reservationTokenHash?: string }>();

        if (held && held.registrationFingerprint === fingerprint) {
            // Same person, same details (for example after a page refresh): hand back the same challan.
            const rotated = await Challan.updateOne(
                { _id: held._id, status: "Reserved", reservationTokenHash: held.reservationTokenHash },
                { $set: { reservationTokenHash: token.tokenHash } },
            );
            if (rotated.modifiedCount === 1) return reservationResponse(token.token, held, deviceToken, true);
        } else if (held && held.reservationTokenHash !== previousTokenHash) {
            return Response.json({
                success: false,
                error: `Challan ${held.challanNumber} is already reserved for this email with different details. Continue with that challan, or generate a new one after ${pktTime(new Date(held.expiresAt))}.`,
                code: "CHALLAN_HELD",
            }, { status: 409 });
        }

        // The per-email limit only counts a change of amount (delegate count, solo/delegation or
        // rate). Refreshing or correcting a typo keeps the same amount and is never counted.
        const previous = await ChallanIssue.findOne({ environment: CHALLAN_ENVIRONMENT, contactEmail: details.contact.email })
            .sort({ reservedAt: -1 })
            .select("-_id category rateType amount")
            .lean<{ category: string; rateType: string; amount: number }>();
        const amountChanged = previous !== null && (
            previous.category !== challanCategory(details.delegates.length) ||
            previous.rateType !== pricingResult.pricing.rateType ||
            previous.amount !== pricingResult.pricing.totalPayable
        );
        if (amountChanged) {
            const emailLimit = await consumeRateLimits([{ key: `challan-reserve-email:${contactHash}`, limit: 2, windowMs: 30 * 60 * 1000 }]);
            if (!emailLimit.allowed) {
                return rateLimitedResponse(emailLimit.retryAfterSeconds, "The number of delegates or registration type was changed too many times for this email. Please wait a while and try again.");
            }
        }

        await ensureDeviceGate(deviceHash, now);

        const challan = await withTransaction(async (session) => {
            await lockDeviceGate(deviceHash, now, session);
            // After 30 minutes a reservation can no longer be submitted, so this email may reserve
            // again. The old challan keeps its graceUntil and stays out of the pool until then.
            await Challan.updateMany(
                { environment: CHALLAN_ENVIRONMENT, reservationContactHash: contactHash, status: "Reserved", expiresAt: { $lte: now } },
                { $set: { status: "Expired" }, $unset: { reservationTokenHash: 1, registrationFingerprint: 1, reservationContactHash: 1 } },
                { session },
            );
            if (previousTokenHash) await endReservation(previousTokenHash, "Superseded", now, session);
            const activeOnDevice = await ChallanIssue.countDocuments({
                deviceHash,
                status: "Active",
                expiresAt: { $gt: now },
                environment: CHALLAN_ENVIRONMENT,
            }).session(session);
            if (activeOnDevice >= MAX_ACTIVE_PER_DEVICE) throw new DeviceReservationLimitError();
            return issueChallan({
                details,
                pricing: pricingResult.pricing,
                fingerprint,
                contactHash,
                tokenHash: token.tokenHash,
                ipHash,
                deviceHash,
                ...(typeof draftId === "string" && DRAFT_ID_PATTERN.test(draftId) ? { draftId } : {}),
                now,
                session,
            });
        });
        return reservationResponse(token.token, challan, deviceToken);
    } catch (error) {
        if (error instanceof DeviceReservationLimitError) {
            return rateLimitedResponse(15 * 60, "Too many challans are currently reserved in this browser. Please submit one or wait for one to expire.");
        }
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
