import { getCommitteeOptions } from "@/lib/committeeOptions";
import { generateApplicationId } from "@/lib/idGenerator";
import { calculatePricing } from "@/lib/pricing";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { getClientIp, rejectCrossOrigin } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import Application from "@/models/Application";
import Delegate, { EXPERIENCE_LEVELS, type IDelegate } from "@/models/Delegate";
import Payment from "@/models/Payment";

interface RegistrationDelegate {
    fullName: string;
    email: string;
    whatsappNumber: string;
    experienceLevel: IDelegate["experienceLevel"];
    additionalInfo?: string;
    firstPreference: string;
    secondPreference: string;
}

interface RegistrationBody {
    participantType: "solo" | "delegation";
    institution?: string;
    delegates: RegistrationDelegate[];
    receiptUrl: string;
    transactionId?: string;
}

type ParseResult =
    | { success: true; value: RegistrationBody }
    | { success: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<const T extends readonly string[]>(
    values: T,
    value: unknown,
): value is T[number] {
    return typeof value === "string" && values.includes(value);
}

function normalizeString(value: unknown): unknown {
    return typeof value === "string" ? value.trim() : value;
}

function normalizePhone(value: unknown): unknown {
    return typeof value === "string" ? value.trim().replace(/[\s-]/g, "") : value;
}

function canonicalCommitteeCode(value: unknown, activeCodes: Set<string>): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return [...activeCodes].find((code) => code.toLowerCase() === normalized.toLowerCase());
}

function parseRegistration(body: unknown, activeCodes: Set<string>): ParseResult {
    if (!isRecord(body)) return { success: false, error: "Request body must be a JSON object." };

    const participantType = normalizeString(body.participantType);
    const institution = normalizeString(body.institution);
    const receiptUrl = normalizeString(body.receiptUrl);
    const transactionId = normalizeString(body.transactionId);
    const delegates = body.delegates;

    if (participantType !== "solo" && participantType !== "delegation") {
        return { success: false, error: "participantType must be 'solo' or 'delegation'." };
    }
    if (!Array.isArray(delegates)) {
        return { success: false, error: "delegates must be an array." };
    }
    if (
        (participantType === "solo" && delegates.length !== 1) ||
        (participantType === "delegation" && (delegates.length < 4 || delegates.length > 7))
    ) {
        return {
            success: false,
            error:
                participantType === "solo"
                    ? "Solo registration must contain exactly one delegate."
                    : "Delegation registration must contain between 4 and 7 delegates.",
        };
    }
    if (participantType === "delegation" && (typeof institution !== "string" || !institution)) {
        return { success: false, error: "institution is required for delegation registrations." };
    }
    if (typeof receiptUrl !== "string" || !receiptUrl) {
        return { success: false, error: "receiptUrl is required." };
    }
    if (transactionId !== undefined && typeof transactionId !== "string") {
        return { success: false, error: "transactionId must be a string." };
    }

    try {
        const receipt = new URL(receiptUrl);
        if (receipt.protocol !== "https:" && receipt.protocol !== "http:") {
            return { success: false, error: "receiptUrl must use HTTP or HTTPS." };
        }
    } catch {
        return { success: false, error: "receiptUrl must be a valid URL." };
    }

    const normalizedDelegates: RegistrationDelegate[] = [];
    for (const [index, entry] of delegates.entries()) {
        if (!isRecord(entry)) {
            return { success: false, error: `delegates[${index}] must be an object.` };
        }

        const fullName = normalizeString(entry.fullName);
        const email = typeof entry.email === "string" ? entry.email.trim().toLowerCase() : entry.email;
        const whatsappNumber = normalizePhone(entry.whatsappNumber);
        const experienceLevel = normalizeString(entry.experienceLevel);
        const additionalInfo = normalizeString(entry.additionalInfo);
        const firstPreference = canonicalCommitteeCode(entry.firstPreference, activeCodes);
        const secondPreference = canonicalCommitteeCode(entry.secondPreference, activeCodes);

        if (typeof fullName !== "string" || !fullName) {
            return { success: false, error: `delegates[${index}].fullName is required.` };
        }
        if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { success: false, error: `delegates[${index}].email must be a valid email address.` };
        }
        if (typeof whatsappNumber !== "string" || !whatsappNumber) {
            return { success: false, error: `delegates[${index}].whatsappNumber is required.` };
        }
        if (!isOneOf(EXPERIENCE_LEVELS, experienceLevel)) {
            return { success: false, error: `delegates[${index}].experienceLevel is invalid.` };
        }
        if (firstPreference === undefined) {
            return {
                success: false,
                error: `delegates[${index}].firstPreference must match an active committee.`,
            };
        }
        if (secondPreference === undefined) {
            return {
                success: false,
                error: `delegates[${index}].secondPreference must match an active committee.`,
            };
        }
        if (additionalInfo !== undefined && typeof additionalInfo !== "string") {
            return {
                success: false,
                error: `delegates[${index}].additionalInfo must be a string.`,
            };
        }

        normalizedDelegates.push({
            fullName,
            email,
            whatsappNumber,
            experienceLevel,
            ...(typeof additionalInfo === "string" ? { additionalInfo } : {}),
            firstPreference,
            secondPreference,
        });
    }

    const emails = normalizedDelegates.map(({ email }) => email);
    if (new Set(emails).size !== emails.length) {
        return {
            success: false,
            error: "Each delegate in the registration must have a distinct email address.",
        };
    }

    return {
        success: true,
        value: {
            participantType,
            ...(typeof institution === "string" ? { institution } : {}),
            delegates: normalizedDelegates,
            receiptUrl,
            ...(typeof transactionId === "string" ? { transactionId } : {}),
        },
    };
}

export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const limit = await consumeRateLimit(`register:${getClientIp(request)}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const committees = await getCommitteeOptions();
    const activeCodes = new Set(committees.map(({ code }) => code));
    const parsed = parseRegistration(body, activeCodes);
    if (!parsed.success) {
        return Response.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const pricingResult = calculatePricing(parsed.value.delegates.length);
    if (!pricingResult.success) {
        const status = pricingResult.code === "REGISTRATION_CLOSED" ? 410 : 400;
        return Response.json(
            { success: false, error: pricingResult.error, code: pricingResult.code },
            { status },
        );
    }

    try {
        const applicationId = await withTransaction(async (session) => {
            const nextApplicationId = generateApplicationId();
            const [application] = await Application.create(
                [
                    {
                        applicationId: nextApplicationId,
                        participantType: parsed.value.participantType,
                        ...(parsed.value.institution ? { institution: parsed.value.institution } : {}),
                    },
                ],
                { session },
            );

            await Delegate.insertMany(
                parsed.value.delegates.map((delegate) => ({
                    ...delegate,
                    applicationId: nextApplicationId,
                })),
                { session },
            );
            await Payment.create(
                [
                    {
                        applicationId: nextApplicationId,
                        totalPayable: pricingResult.pricing.totalPayable,
                        rateType: pricingResult.pricing.rateType,
                        receiptUrl: parsed.value.receiptUrl,
                        ...(parsed.value.transactionId
                            ? { transactionId: parsed.value.transactionId }
                            : {}),
                    },
                ],
                { session },
            );

            return application.applicationId;
        });

        return Response.json(
            {
                success: true,
                applicationId,
                totalPayable: pricingResult.pricing.totalPayable,
            },
            { status: 201 },
        );
    } catch (error) {
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
