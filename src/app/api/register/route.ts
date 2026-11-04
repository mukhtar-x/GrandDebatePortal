import { after } from "next/server";
import type { Types } from "mongoose";
import { MIN_DELEGATION_SIZE } from "@/data/event";
import { getCommitteeOptions } from "@/lib/committeeOptions";
import connectDB from "@/lib/db";
import { generateApplicationId } from "@/lib/idGenerator";
import { notifyContact } from "@/lib/mailer";
import { calculatePricingAtRate, type Pricing } from "@/lib/pricing";
import { CHALLAN_ENVIRONMENT, challanCategory, hashSecret, recordSubmittedChallan, registrationFingerprint } from "@/lib/challans";
import { consumeRateLimits, rateLimitedResponse } from "@/lib/rateLimit";
import { quickCheckReceiptSafely } from "@/lib/receipts/analyze";
import { deleteReceipt, putReceipt, receiptUrlFor } from "@/lib/receipts/store";
import { MAX_RECEIPT_BYTES, processReceipt } from "@/lib/receipts/validate";
import { alreadyRegisteredResponse, parseRegistrationDetails, type RegistrationDetails } from "@/lib/registrationInput";
import { getClientIp, isHoneypotFilled, rejectCrossOrigin } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { MAX_LENGTHS, firstName, isRecord, normalizeString, recursiveSanitize } from "@/lib/validation";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";
import Challan from "@/models/Challan";

export const maxDuration = 60;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const RESERVATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/;
const CHALLAN_INVALID_ERROR = "This challan has expired or no longer matches your details. Generate a new challan and upload the receipt again.";

interface RegistrationBody extends RegistrationDetails {
    transactionId?: string;
    idempotencyKey?: string;
    reservationToken: string;
}

type ParseResult =
    | { success: true; value: RegistrationBody }
    | { success: false; error: string; field?: string };

function parseRegistration(body: unknown, activeCodes: Set<string>): ParseResult {
    const details = parseRegistrationDetails(body, activeCodes);
    if (!details.success) return details;
    const record = body as Record<string, unknown>;
    const transactionId = normalizeString(record.transactionId);
    const idempotencyKey = normalizeString(record.idempotencyKey);
    const reservationToken = normalizeString(record.reservationToken);

    if (
        transactionId !== undefined &&
        transactionId !== "" &&
        (typeof transactionId !== "string" || transactionId.length > MAX_LENGTHS.transactionId)
    ) {
        return { success: false, error: "Transaction ID is invalid.", field: "transactionId" };
    }
    if (
        idempotencyKey !== undefined &&
        (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey))
    ) {
        return { success: false, error: "idempotencyKey is invalid.", field: "idempotencyKey" };
    }
    if (typeof reservationToken !== "string" || !RESERVATION_TOKEN_PATTERN.test(reservationToken)) {
        return { success: false, error: "Generate a challan for these details before submitting payment.", field: "reservationToken" };
    }

    return {
        success: true,
        value: {
            ...details.value,
            reservationToken,
            ...(typeof transactionId === "string" && transactionId ? { transactionId } : {}),
            ...(typeof idempotencyKey === "string" ? { idempotencyKey } : {}),
        },
    };
}

class ChallanInvalidError extends Error {}

function challanInvalidResponse(): Response {
    return Response.json({ success: false, error: CHALLAN_INVALID_ERROR, code: "CHALLAN_INVALID" }, { status: 409 });
}

/** The registration details alone, as fingerprinted when the challan was reserved. */
function detailsOf(registration: RegistrationBody): RegistrationDetails {
    const { participantType, institution, delegates, contact, headIsDelegate, baCode } = registration;
    return { participantType, institution, delegates, contact, headIsDelegate, ...(baCode ? { baCode } : {}) };
}

function successResponse(
    applicationId: string,
    contactName: string,
    pricing: Pick<Pricing, "totalPayable" | "rateType">,
    status = 201,
    challanNumber?: string,
    challanEnvironment: "test" | "live" = CHALLAN_ENVIRONMENT,
): Response {
    return Response.json(
        {
            success: true,
            applicationId,
            firstName: firstName(contactName),
            totalPayable: pricing.totalPayable,
            rateType: pricing.rateType,
            ...(challanNumber ? { challanNumber } : {}),
            test: challanEnvironment === "test",
        },
        { status },
    );
}

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    // Browsers always send a length for form uploads; without one the body size is unbounded.
    const declaredLength = request.headers.get("content-length");
    if (!declaredLength) {
        return Response.json({ success: false, error: "Content-Length is required." }, { status: 411 });
    }
    if (Number(declaredLength) > MAX_RECEIPT_BYTES + 256 * 1024) {
        return Response.json(
            { success: false, error: "The file is too large. Please upload a smaller file." },
            { status: 413 },
        );
    }

    const ip = getClientIp(request);
    const limit = await consumeRateLimits([
        { key: `register-burst:${ip}`, limit: 10, windowMs: 60 * 1000 },
        { key: `register:${ip}`, limit: 20, windowMs: 60 * 60 * 1000 },
    ]);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    let formData: FormData;
    let body: unknown;
    try {
        formData = await request.formData();
        const payload = formData.get("payload");
        if (typeof payload !== "string") throw new Error("Missing payload");
        body = recursiveSanitize(JSON.parse(payload));
    } catch {
        return Response.json(
            {
                success: false,
                error: "Request must be multipart/form-data with a JSON 'payload' field and a 'receipt' file.",
            },
            { status: 400 },
        );
    }

    if (isRecord(body) && isHoneypotFilled(body.website)) {
        return Response.json({ success: false, error: "Registration could not be completed." }, { status: 400 });
    }

    const committees = await getCommitteeOptions();
    const activeCodes = new Set(committees.map(({ code }) => code));
    const parsed = parseRegistration(body, activeCodes);
    if (!parsed.success) {
        return Response.json(
            { success: false, error: parsed.error, ...(parsed.field ? { field: parsed.field } : {}) },
            { status: 400 },
        );
    }
    const registration = parsed.value;

    try {
        await connectDB();

        // A repeated submit (double click, network retry) returns the original registration.
        if (registration.idempotencyKey) {
            const existing = await Application.findOne({ idempotencyKey: registration.idempotencyKey })
                .select("applicationId contactName")
                .lean<{ applicationId: string; contactName?: string }>();
            if (existing) {
                const payment = await Payment.findOne({ applicationId: existing.applicationId })
                    .select("totalPayable rateType challanNumber challanEnvironment")
                    .lean<{ totalPayable: number; rateType: Pricing["rateType"]; challanNumber?: string; challanEnvironment?: "test" | "live" }>();
                if (payment) {
                    return successResponse(
                        existing.applicationId,
                        existing.contactName ?? registration.contact.name,
                        payment,
                        200,
                        payment.challanNumber,
                        payment.challanEnvironment,
                    );
                }
            }
        }

        const duplicate = await alreadyRegisteredResponse(registration);
        if (duplicate) return duplicate;
    } catch (error) {
        console.error("Registration pre-checks failed:", error);
        return Response.json(
            { success: false, error: "Registration could not be completed. Please try again." },
            { status: 500 },
        );
    }

    const challanTokenHash = hashSecret(registration.reservationToken);
    const fingerprint = registrationFingerprint(detailsOf(registration));
    const reservedChallanFilter = {
        environment: CHALLAN_ENVIRONMENT,
        reservationTokenHash: challanTokenHash,
        registrationFingerprint: fingerprint,
        status: "Reserved",
    };
    let pricingResult: ReturnType<typeof calculatePricingAtRate>;
    try {
        // Checked before the receipt is processed and stored, so a stale challan fails fast.
        // Submission is accepted only within the 30-minute reservation, not the grace period after it.
        const reservedChallan = await Challan.findOne({ ...reservedChallanFilter, expiresAt: { $gt: new Date() } })
            .select("category rateType amount")
            .lean<{ category: string; rateType: Pricing["rateType"]; amount: number }>();
        if (!reservedChallan) return challanInvalidResponse();
        pricingResult = calculatePricingAtRate(registration.delegates.length, reservedChallan.rateType);
        if (
            reservedChallan.category !== challanCategory(registration.delegates.length) ||
            !pricingResult.success ||
            reservedChallan.amount !== pricingResult.pricing.totalPayable
        ) {
            return challanInvalidResponse();
        }
    } catch (error) {
        console.error("Challan validation failed:", error);
        return Response.json({ success: false, error: "The challan could not be validated. Please try again." }, { status: 503 });
    }

    const receiptResult = await processReceipt(formData.get("receipt"));
    if (!receiptResult.success) {
        return Response.json(
            { success: false, error: receiptResult.error, field: "receipt" },
            { status: receiptResult.status },
        );
    }
    const receipt = receiptResult.receipt;

    const applicationId = generateApplicationId();
    let receiptFileId: string;
    try {
        // GridFS cannot join the transaction, so the file is stored first and removed on failure.
        receiptFileId = await putReceipt(receipt.buffer, {
            mime: receipt.mime,
            applicationId,
            sha256: receipt.sha256,
        });
    } catch (error) {
        console.error("Receipt upload failed:", error);
        return Response.json(
            { success: false, error: "Your receipt could not be uploaded. Please try again." },
            { status: 500 },
        );
    }

    try {
        let registeredChallanNumber = "";
        await withTransaction(async (session) => {
            const now = new Date();
            const challan = await Challan.findOneAndUpdate({
                ...reservedChallanFilter,
                expiresAt: { $gt: now },
                amount: pricingResult.pricing.totalPayable,
                rateType: pricingResult.pricing.rateType,
            }, {
                $set: { status: "Submitted", applicationId },
                $unset: { reservationTokenHash: 1, registrationFingerprint: 1, reservationContactHash: 1, expiresAt: 1 },
            }, { session, returnDocument: "after" }).lean<{ challanNumber: string; currentIssueId?: Types.ObjectId }>();
            if (!challan) throw new ChallanInvalidError();
            registeredChallanNumber = challan.challanNumber;
            const otherChallanNumbers = (await recordSubmittedChallan({
                challanIssueId: challan.currentIssueId,
                applicationId,
                contactEmail: registration.contact.email,
                draftId: registration.idempotencyKey,
                now,
                session,
            })).filter((number) => number !== challan.challanNumber);

            await Application.create(
                [
                    {
                        applicationId,
                        participantType: registration.participantType,
                        delegateCount: registration.delegates.length,
                        institution: registration.institution,
                        ...(registration.baCode ? { baCode: registration.baCode } : {}),
                        contactName: registration.contact.name,
                        contactEmail: registration.contact.email,
                        contactWhatsapp: registration.contact.whatsapp,
                        headIsDelegate: registration.headIsDelegate,
                        ...(registration.idempotencyKey ? { idempotencyKey: registration.idempotencyKey } : {}),
                    },
                ],
                { session },
            );

            await Delegate.insertMany(
                registration.delegates.map((delegate) => ({ ...delegate, applicationId })),
                { session },
            );

            const persistedDelegateCount = await Delegate.countDocuments({ applicationId }).session(session);
            if (
                registration.participantType === "delegation" &&
                persistedDelegateCount < MIN_DELEGATION_SIZE
            ) {
                throw new Error(
                    `Delegation invariant failed: expected at least ${MIN_DELEGATION_SIZE} persisted delegates.`,
                );
            }
            if (persistedDelegateCount !== registration.delegates.length) {
                throw new Error("Persisted delegate count does not match the registration payload.");
            }

            await Payment.create(
                [
                    {
                        applicationId,
                        totalPayable: pricingResult.pricing.totalPayable,
                        rateType: pricingResult.pricing.rateType,
                        challanNumber: challan.challanNumber,
                        ...(otherChallanNumbers.length ? { otherChallanNumbers } : {}),
                        challanEnvironment: CHALLAN_ENVIRONMENT,
                        delegationFee: pricingResult.pricing.delegationFee,
                        receiptUrl: receiptUrlFor(receiptFileId),
                        receiptFileId,
                        receiptMime: receipt.mime,
                        receiptSha256: receipt.sha256,
                        receiptDhash: receipt.dhash,
                        receiptEditingSoftware: receipt.editingSoftware,
                        ...(registration.transactionId ? { transactionId: registration.transactionId } : {}),
                    },
                ],
                { session },
            );
        });

        // Instant duplicate checks; the slower OCR check is run by organisers from the admin panel.
        after(() => quickCheckReceiptSafely(applicationId));
        after(() =>
            notifyContact(applicationId, {
                type: "registrationReceived",
                totalPayable: pricingResult.pricing.totalPayable,
                rateType: pricingResult.pricing.rateType,
                participantType: registration.participantType,
                delegateCount: registration.delegates.length,
                challanNumber: registeredChallanNumber,
                delegationFee: pricingResult.pricing.delegationFee,
                challanEnvironment: CHALLAN_ENVIRONMENT,
            }),
        );
        return successResponse(applicationId, registration.contact.name, pricingResult.pricing, 201, registeredChallanNumber, CHALLAN_ENVIRONMENT);
    } catch (error) {
        await deleteReceipt(receiptFileId);
        if (error instanceof ChallanInvalidError) return challanInvalidResponse();
        if (isRecord(error) && error.code === 11000) {
            return Response.json(
                { success: false, error: "A registration with conflicting unique data already exists." },
                { status: 409 },
            );
        }
        console.error("Registration transaction failed:", error);
        return Response.json(
            { success: false, error: "Registration could not be completed. Please try again." },
            { status: 500 },
        );
    }
}
