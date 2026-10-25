import { parsePhoneNumberFromString } from "libphonenumber-js";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_LENGTHS = {
    name: 100,
    email: 254,
    institution: 150,
    additionalInfo: 1000,
    transactionId: 64,
    reason: 500,
    portfolio: 100,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isOneOf<const T extends readonly string[]>(
    values: T,
    value: unknown,
): value is T[number] {
    return typeof value === "string" && values.includes(value);
}

/** Strips script/style blocks, HTML tags, and dangerous injections from a string. */
export function stripHtml(value: string): string {
    return value
        .replace(/<\s*(script|style|iframe|object|embed|applet)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
        .replace(/<\/?[a-zA-Z][^>]*>/gi, "")
        .replace(/javascript:[^"'\s]*/gi, "")
        .trim();
}

/** Sanitizes and auto-trims a string input, stripping any raw HTML or script tags. */
export function sanitizeString(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return stripHtml(value);
}

export function normalizeString(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return stripHtml(value);
}

export function normalizeEmail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const email = stripHtml(value).toLowerCase();
    return email.length <= MAX_LENGTHS.email && EMAIL_PATTERN.test(email) ? email : null;
}

/** Returns the number in E.164 format (e.g. +923143552058), defaulting to Pakistan. */
export function normalizeWhatsapp(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const sanitized = stripHtml(value);
    if (sanitized.length > 32) return null;
    const phone = parsePhoneNumberFromString(sanitized, "PK");
    return phone?.isValid() ? phone.number : null;
}

/**
 * Recursively sanitizes any input object, array, or primitive:
 * - Trims leading/trailing whitespace
 * - Strips raw HTML and script tags
 * - Preserves original object/array structure
 */
export function recursiveSanitize<T>(input: T): T {
    if (typeof input === "string") {
        return stripHtml(input) as unknown as T;
    }
    if (Array.isArray(input)) {
        return input.map((item) => recursiveSanitize(item)) as unknown as T;
    }
    if (isRecord(input)) {
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(input)) {
            sanitized[key] = recursiveSanitize(val);
        }
        return sanitized as unknown as T;
    }
    return input;
}

export function isWithinLength(value: string, max: number): boolean {
    return value.length <= max;
}

export function firstName(fullName: string): string {
    return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
