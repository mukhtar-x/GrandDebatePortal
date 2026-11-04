import { createHash, randomBytes } from "node:crypto";
import { calculatePricing } from "@/lib/pricing";
import type { ChallanCategory } from "@/models/Challan";

export const CHALLAN_RESERVATION_MS = 30 * 60 * 1000;
export const CHALLAN_GRACE_MS = 15 * 60 * 1000;
export const CHALLAN_ENVIRONMENT: "test" | "live" = process.env.CHALLAN_MODE === "test"
    ? "test"
    : process.env.CHALLAN_MODE === "live" || process.env.NODE_ENV === "production" ? "live" : "test";

export function getChallanDetails(participantType: unknown, delegateCount: unknown) {
    if ((participantType !== "solo" && participantType !== "delegation") || typeof delegateCount !== "number" || !Number.isInteger(delegateCount)) return null;
    const count = delegateCount as number;
    if (participantType === "solo" ? count !== 1 : count < 4 || count > 7) return null;
    const pricing = calculatePricing(count);
    if (!pricing.success) return null;
    const category = (count === 1 ? "solo" : `delegation-${count}`) as ChallanCategory;
    return { category, ...pricing.pricing };
}

export function createReservationToken() {
    const token = randomBytes(32).toString("base64url");
    return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export function registrationFingerprint(value: unknown): string {
    const stable = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(stable);
        if (input && typeof input === "object") {
            return Object.fromEntries(Object.entries(input as Record<string, unknown>)
                .filter(([key]) => !["transactionId", "idempotencyKey", "reservationToken"].includes(key))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, stable(item)]));
        }
        return input;
    };
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
