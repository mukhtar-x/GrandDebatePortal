import {
    DELEGATION_FEE,
    EARLY_BIRD_ENDS_AT,
    MAX_DELEGATION_SIZE,
    MIN_DELEGATION_SIZE,
    REGISTRATION_ENDS_AT,
    REGISTRATION_FEES,
} from "@/data/event";

export const EARLY_BIRD_PRICE = REGISTRATION_FEES.earlyBird;
export const REGULAR_PRICE = REGISTRATION_FEES.regular;
export const REGULAR_RATE_START = new Date(EARLY_BIRD_ENDS_AT);
export const EARLY_BIRD_DEADLINE = new Date(REGULAR_RATE_START.getTime() - 1);
export const REGISTRATION_CLOSED_AT = new Date(REGISTRATION_ENDS_AT);

export interface Pricing {
    totalPayable: number;
    rateType: "Early bird" | "Regular";
    pricePerDelegate: number;
    delegationFee: number;
}

export type PricingResult =
    | { success: true; pricing: Pricing }
    | { success: false; error: string; code: "REGISTRATION_CLOSED" | "INVALID_PRICING_INPUT" };

export function calculatePricingAtRate(
    delegateCount: number,
    rateType: Pricing["rateType"],
): PricingResult {
    const validCount = Number.isInteger(delegateCount) && (delegateCount === 1 || (delegateCount >= MIN_DELEGATION_SIZE && delegateCount <= MAX_DELEGATION_SIZE));
    if (!validCount) return { success: false, code: "INVALID_PRICING_INPUT", error: "Delegate count is invalid." };
    const pricePerDelegate = rateType === "Early bird" ? EARLY_BIRD_PRICE : REGULAR_PRICE;
    const delegationFee = delegateCount > 1 ? DELEGATION_FEE : 0;
    return {
        success: true,
        pricing: {
            totalPayable: pricePerDelegate * delegateCount + delegationFee,
            rateType,
            pricePerDelegate,
            delegationFee,
        },
    };
}

export function calculatePricing(delegateCount: number, date = new Date()): PricingResult {
    const validCount =
        Number.isInteger(delegateCount) &&
        (delegateCount === 1 ||
            (delegateCount >= MIN_DELEGATION_SIZE && delegateCount <= MAX_DELEGATION_SIZE));
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

    return calculatePricingAtRate(delegateCount, date < REGULAR_RATE_START ? "Early bird" : "Regular");
}
