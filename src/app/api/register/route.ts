import { after } from "next/server";
import { getCommitteeOptions } from "@/lib/committeeOptions";
import connectDB from "@/lib/db";
import { generateApplicationId } from "@/lib/idGenerator";
import { notifyContact } from "@/lib/mailer";
import { calculatePricing, type Pricing } from "@/lib/pricing";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { quickCheckReceiptSafely } from "@/lib/receipts/analyze";
import { deleteReceipt, putReceipt, receiptUrlFor } from "@/lib/receipts/store";
import { MAX_RECEIPT_BYTES, processReceipt } from "@/lib/receipts/validate";
import { getClientIp, isHoneypotFilled, rejectCrossOrigin } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import {
    MAX_LENGTHS,
    firstName,
    isOneOf,
    isRecord,
    normalizeEmail,
    normalizeString,
    normalizeWhatsapp,
    recursiveSanitize,
} from "@/lib/validation";
import Application from "@/models/Application";
import Delegate, { EXPERIENCE_LEVELS, type IDelegate } from "@/models/Delegate";
import Payment from "@/models/Payment";

export const maxDuration = 60;

const CONTACT_LINE = "Please contact us on WhatsApp at 0314 3552058 or by email at tlc.khi@nu.edu.pk.";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

interface RegistrationDelegate {
    fullName: string;
    email: string;
    whatsappNumber: string;
    experienceLevel: IDelegate["experienceLevel"];
    additionalInfo?: string;
    firstPreference: string;
    secondPreference: string;
    isHead: boolean;
}

interface RegistrationContact {
    name: string;
    email: string;
    whatsapp: string;
}

interface RegistrationBody {
    participantType: "solo" | "delegation";
    institution: string;
    delegates: RegistrationDelegate[];
    contact: RegistrationContact;
    headIsDelegate: boolean;
    transactionId?: string;
    idempotencyKey?: string;
}

type ParseResult =
    | { success: true; value: RegistrationBody }
    | { success: false; error: string; field?: string };

function canonicalCommitteeCode(value: unknown, activeCodes: Set<string>): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return [...activeCodes].find((code) => code.toLowerCase() === normalized.toLowerCase());
}

function requiredText(value: unknown, max: number): string | null {
    const text = normalizeString(value);
    return typeof text === "string" && text && text.length <= max ? text : null;
}

function parseRegistration(body: unknown, activeCodes: Set<string>): ParseResult {
    if (!isRecord(body)) return { success: false, error: "Registration details are missing." };

    const participantType = normalizeString(body.participantType);
    const transactionId = normalizeString(body.transactionId);
    const idempotencyKey = normalizeString(body.idempotencyKey);
    const delegates = body.delegates;

    if (participantType !== "solo" && participantType !== "delegation") {
        return { success: false, error: "participantType must be 'solo' or 'delegation'.", field: "participantType" };
    }
    if (!Array.isArray(delegates)) {
        return { success: false, error: "delegates must be an array.", field: "delegates" };
    }
    if (participantType === "solo" && delegates.length !== 1) {
        return { success: false, error: "Solo registration must contain exactly one delegate.", field: "delegates" };
    }
    if (participantType === "delegation" && (delegates.length < 4 || delegates.length > 7)) {
        return { success: false, error: "A delegation must consist of between 4 and 7 delegates.", field: "delegates" };
    }

    const institution = requiredText(body.institution, MAX_LENGTHS.institution);
    if (!institution) {
        return { success: false, error: "Please complete this field.", field: "institution" };
    }
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

    const normalizedDelegates: RegistrationDelegate[] = [];
    for (const [index, entry] of delegates.entries()) {
        const field = (name: string) => `delegates[${index}].${name}`;
        if (!isRecord(entry)) {
            return { success: false, error: `delegates[${index}] must be an object.`, field: `delegates[${index}]` };
        }

        const fullName = requiredText(entry.fullName, MAX_LENGTHS.name);
        const email = normalizeEmail(entry.email);
        const whatsappNumber = normalizeWhatsapp(entry.whatsappNumber);
        const experienceLevel = normalizeString(entry.experienceLevel);
        const additionalInfo = normalizeString(entry.additionalInfo);
        const firstPreference = canonicalCommitteeCode(entry.firstPreference, activeCodes);
        const secondPreference = canonicalCommitteeCode(entry.secondPreference, activeCodes);

        if (!fullName) {
            return { success: false, error: "Please complete this field.", field: field("fullName") };
        }
        if (!email) {
            return { success: false, error: "Please enter a valid email address.", field: field("email") };
        }
        if (!whatsappNumber) {
            return {
                success: false,
                error: "Please enter a valid WhatsApp number, including the country code.",
                field: field("whatsappNumber"),
            };
        }
        if (!isOneOf(EXPERIENCE_LEVELS, experienceLevel)) {
            return { success: false, error: "Please complete this field.", field: field("experienceLevel") };
        }
        if (firstPreference === undefined) {
            return { success: false, error: "Please complete this field.", field: field("firstPreference") };
        }
        if (secondPreference === undefined) {
            return { success: false, error: "Please complete this field.", field: field("secondPreference") };
        }
        if (firstPreference === secondPreference) {
            return {
                success: false,
                error: "Your first and second preferences must be different committees.",
                field: field("secondPreference"),
            };
        }
        if (
            additionalInfo !== undefined &&
            (typeof additionalInfo !== "string" || additionalInfo.length > MAX_LENGTHS.additionalInfo)
        ) {
            return { success: false, error: "Additional information is too long.", field: field("additionalInfo") };
        }

        normalizedDelegates.push({
            fullName,
            email,
            whatsappNumber,
            experienceLevel,
            ...(typeof additionalInfo === "string" && additionalInfo ? { additionalInfo } : {}),
            firstPreference,
            secondPreference,
            isHead: false,
        });
    }

    const emails = normalizedDelegates.map(({ email }) => email);
    if (new Set(emails).size !== emails.length) {
        return {
            success: false,
            error: "Each delegate in the registration must have a distinct email address.",
            field: "delegates",
        };
    }

    let contact: RegistrationContact;
    let headIsDelegate = false;
    if (participantType === "solo") {
        const [delegate] = normalizedDelegates;
        contact = { name: delegate.fullName, email: delegate.email, whatsapp: delegate.whatsappNumber };
    } else {
        const headName = requiredText(body.headName, MAX_LENGTHS.name);
        const headEmail = normalizeEmail(body.headEmail);
        const headWhatsapp = normalizeWhatsapp(body.headWhatsapp);
        headIsDelegate = body.headIsDelegate === true;

        if (!headName) return { success: false, error: "Please complete this field.", field: "headName" };
        if (!headEmail) {
            return { success: false, error: "Please enter a valid email address.", field: "headEmail" };
        }
        if (!headWhatsapp) {
            return {
                success: false,
                error: "Please enter a valid WhatsApp number, including the country code.",
                field: "headWhatsapp",
            };
        }
        if (headIsDelegate) {
            // The head delegate's details are entered as Delegate 1.
            if (normalizedDelegates[0].email !== headEmail) {
                return {
                    success: false,
                    error: "Delegate 1 must use the head delegate's email address.",
                    field: "delegates[0].email",
                };
            }
            normalizedDelegates[0].isHead = true;
        }
        contact = { name: headName, email: headEmail, whatsapp: headWhatsapp };
    }

    return {
        success: true,
        value: {
            participantType,
            institution,
            delegates: normalizedDelegates,
            contact,
            headIsDelegate,
            ...(typeof transactionId === "string" && transactionId ? { transactionId } : {}),
            ...(typeof idempotencyKey === "string" ? { idempotencyKey } : {}),
        },
    };
}

function successResponse(
    applicationId: string,
    contactName: string,
    pricing: Pick<Pricing, "totalPayable" | "rateType">,
    status = 201,
): Response {
    return Response.json(
        {
            success: true,
            applicationId,
            firstName: firstName(contactName),
            totalPayable: pricing.totalPayable,
            rateType: pricing.rateType,
        },
        { status },
    );
}

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RECEIPT_BYTES + 256 * 1024) {
        return Response.json(
            { success: false, error: "The file is too large. Please upload a smaller file." },
            { status: 413 },
        );
    }

    const limit = await consumeRateLimit(`register:${getClientIp(request)}`, 20, 60 * 60 * 1000);
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
                    .select("totalPayable rateType")
                    .lean<{ totalPayable: number; rateType: Pricing["rateType"] }>();
                if (payment) {
                    return successResponse(
                        existing.applicationId,
                        existing.contactName ?? registration.contact.name,
                        payment,
                        200,
                    );
                }
            }
        }

        const alreadyRegistered = await Delegate.exists({
            email: { $in: registration.delegates.map(({ email }) => email) },
        });
        if (alreadyRegistered) {
            return Response.json(
                {
                    success: false,
                    error: `One or more of these email addresses is already registered. ${CONTACT_LINE}`,
                    code: "ALREADY_REGISTERED",
                },
                { status: 409 },
            );
        }
    } catch (error) {
        console.error("Registration pre-checks failed:", error);
        return Response.json(
            { success: false, error: "Registration could not be completed. Please try again." },
            { status: 500 },
        );
    }

    const pricingResult = calculatePricing(registration.delegates.length);
    if (!pricingResult.success) {
        const status = pricingResult.code === "REGISTRATION_CLOSED" ? 410 : 400;
        return Response.json(
            { success: false, error: pricingResult.error, code: pricingResult.code },
            { status },
        );
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
        await withTransaction(async (session) => {
            await Application.create(
                [
                    {
                        applicationId,
                        participantType: registration.participantType,
                        institution: registration.institution,
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
            await Payment.create(
                [
                    {
                        applicationId,
                        totalPayable: pricingResult.pricing.totalPayable,
                        rateType: pricingResult.pricing.rateType,
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
            }),
        );
        return successResponse(applicationId, registration.contact.name, pricingResult.pricing);
    } catch (error) {
        await deleteReceipt(receiptFileId);
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
