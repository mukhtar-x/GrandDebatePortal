import { randomBytes } from "node:crypto";

export function generateApplicationId(date = new Date()): string {
    const year = date.getUTCFullYear();
    const suffix = randomBytes(8).toString("hex").toUpperCase();
    return `TGD-${year}-${suffix}`;
}
