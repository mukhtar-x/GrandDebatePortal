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

export function normalizeString(value: unknown): unknown {
    return typeof value === "string" ? value.trim() : value;
}

export function normalizeEmail(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const email = value.trim().toLowerCase();
    return email.length <= MAX_LENGTHS.email && EMAIL_PATTERN.test(email) ? email : null;
}

/** Returns the number in E.164 format (e.g. +923143552058), defaulting to Pakistan. */
export function normalizeWhatsapp(value: unknown): string | null {
    if (typeof value !== "string" || value.trim().length > 32) return null;
    const phone = parsePhoneNumberFromString(value.trim(), "PK");
    return phone?.isValid() ? phone.number : null;
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
