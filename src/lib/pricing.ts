export const EARLY_BIRD_PRICE = 2000;
export const REGULAR_PRICE = 2400;
export const REGULAR_RATE_START = new Date("2026-11-08T00:00:00.000+05:00");
export const EARLY_BIRD_DEADLINE = new Date(REGULAR_RATE_START.getTime() - 1);
export const REGISTRATION_CLOSED_AT = new Date("2026-11-16T00:00:00.000+05:00");

export interface Pricing {
    totalPayable: number;
    rateType: "Early bird" | "Regular";
    pricePerDelegate: number;
}

export type PricingResult =
    | { success: true; pricing: Pricing }
    | { success: false; error: string; code: "REGISTRATION_CLOSED" | "INVALID_PRICING_INPUT" };

export function calculatePricing(delegateCount: number, date = new Date()): PricingResult {
    const validCount =
        Number.isInteger(delegateCount) &&
        (delegateCount === 1 || (delegateCount >= 4 && delegateCount <= 7));
    if (!validCount || Number.isNaN(date.getTime())) {
        return {
            success: false,
            code: "INVALID_PRICING_INPUT",
            error: "Delegate count or pricing date is invalid.",
        };
    }
    if (date >= REGISTRATION_CLOSED_AT) {
        return {
            success: false,
            code: "REGISTRATION_CLOSED",
            error: "Registrations are closed.",
        };
    }

    const isEarlyBird = date < REGULAR_RATE_START;
    const pricePerDelegate = isEarlyBird ? EARLY_BIRD_PRICE : REGULAR_PRICE;

    return {
        success: true,
        pricing: {
            totalPayable: pricePerDelegate * delegateCount,
            rateType: isEarlyBird ? "Early bird" : "Regular",
            pricePerDelegate,
        },
    };
}
