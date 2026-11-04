import { MAX_DELEGATION_SIZE, MIN_DELEGATION_SIZE } from "@/data/event";
import {
    MAX_LENGTHS,
    isOneOf,
    isRecord,
    normalizeEmail,
    normalizeString,
    normalizeWhatsapp,
} from "@/lib/validation";
import Delegate, { EXPERIENCE_LEVELS, type IDelegate } from "@/models/Delegate";

export const CONTACT_LINE = "Please contact us on WhatsApp at 0314 3552058 or by email at tlc.khi@nu.edu.pk.";

export interface RegistrationDelegate {
    fullName: string;
    email: string;
    whatsappNumber: string;
    experienceLevel: IDelegate["experienceLevel"];
    additionalInfo?: string;
    firstPreference: string;
    secondPreference: string;
    isHead: boolean;
}

export interface RegistrationContact {
    name: string;
    email: string;
    whatsapp: string;
}

/** Everything that defines a registration, and therefore which challan it may use. */
export interface RegistrationDetails {
    participantType: "solo" | "delegation";
    institution: string;
    delegates: RegistrationDelegate[];
    contact: RegistrationContact;
    headIsDelegate: boolean;
    baCode?: string;
}

export type DetailsResult =
    | { success: true; value: RegistrationDetails }
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

/**
 * Validates and normalises registration details. Shared by challan reservation and
 * registration, so nobody is given a challan for details that would later be rejected.
 */
export function parseRegistrationDetails(body: unknown, activeCodes: Set<string>): DetailsResult {
    if (!isRecord(body)) return { success: false, error: "Registration details are missing." };

    const participantType = normalizeString(body.participantType);
    const baCode = normalizeString(body.baCode);
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
    if (
        participantType === "delegation" &&
        (delegates.length < MIN_DELEGATION_SIZE || delegates.length > MAX_DELEGATION_SIZE)
    ) {
        return {
            success: false,
            error: `A delegation must consist of between ${MIN_DELEGATION_SIZE} and ${MAX_DELEGATION_SIZE} delegates.`,
            field: "delegates",
        };
    }

    const institution = requiredText(body.institution, MAX_LENGTHS.institution);
    if (!institution) {
        return { success: false, error: "Please complete this field.", field: "institution" };
    }
    if (baCode !== undefined && baCode !== "" && (typeof baCode !== "string" || baCode.length > MAX_LENGTHS.baCode)) {
        return { success: false, error: "BA Code is invalid or too long.", field: "baCode" };
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
            ...(typeof baCode === "string" && baCode ? { baCode } : {}),
        },
    };
}

/** Returns a 409 response when any delegate email already belongs to a registration. */
export async function alreadyRegisteredResponse(details: RegistrationDetails): Promise<Response | null> {
    const existing = await Delegate.findOne({
        email: { $in: details.delegates.map(({ email }) => email) },
    }).select("-_id email").lean<{ email: string }>();
    if (!existing) return null;
    // Point at the delegate who is already registered so the form can jump to that field.
    const index = details.delegates.findIndex(({ email }) => email === existing.email);
    return Response.json(
        {
            success: false,
            error: `This email address is already registered. ${CONTACT_LINE}`,
            code: "ALREADY_REGISTERED",
            ...(index >= 0 ? { field: `delegates[${index}].email` } : {}),
        },
        { status: 409 },
    );
}
