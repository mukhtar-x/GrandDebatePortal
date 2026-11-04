import { DELEGATION_FEE, REGISTRATION_FEES } from "@/data/event";
import Challan from "@/models/Challan";
import { challanCategory } from "@/lib/challans";

const WINDOWS = [
    { rateType: "Early bird" as const, prefix: 42, perDelegate: REGISTRATION_FEES.earlyBird },
    { rateType: "Regular" as const, prefix: 48, perDelegate: REGISTRATION_FEES.regular },
];
const CATEGORY_COUNTS = [
    { count: 1, quantity: 900 },
    { count: 4, quantity: 150 },
    { count: 5, quantity: 150 },
    { count: 6, quantity: 150 },
    { count: 7, quantity: 150 },
];

let seedPromise: Promise<void> | null = null;

/** Creates an unmistakable, finite TEST- prefixed inventory, idempotently, for staging. */
export function ensureTestChallanPool(): Promise<void> {
    seedPromise ??= (async () => {
        // Pools created before the per-window fix priced every Regular challan at the early-bird rate.
        await Promise.all(WINDOWS.flatMap((window) => CATEGORY_COUNTS.map((item) => Challan.updateMany(
            { environment: "test", category: challanCategory(item.count), rateType: window.rateType, status: { $ne: "Submitted" } },
            { $set: { amount: window.perDelegate * item.count + (item.count > 1 ? DELEGATION_FEE : 0) } },
        ))));
        const currentCount = await Challan.countDocuments({ environment: "test" });
        if (currentCount >= 3000) return;
        const operations = [];
        for (const window of WINDOWS) {
            let serial = window.prefix * 1000 + 1;
            for (const item of CATEGORY_COUNTS) {
                const category = challanCategory(item.count);
                for (let index = 0; index < item.quantity; index += 1) {
                    const challanNumber = `TEST-${serial++}`;
                    operations.push({
                        updateOne: {
                            filter: { challanNumber },
                            update: { $setOnInsert: {
                                challanNumber,
                                environment: "test",
                                category,
                                rateType: window.rateType,
                                amount: window.perDelegate * item.count + (item.count > 1 ? DELEGATION_FEE : 0),
                                status: "Available",
                                issueCount: 0,
                            } },
                            upsert: true,
                        },
                    });
                }
            }
        }
        if (operations.length) {
            try {
                await Challan.bulkWrite(operations, { ordered: false });
            } catch (error) {
                // Concurrent cold starts may upsert the same deterministic test numbers.
                const code = typeof error === "object" && error !== null ? (error as { code?: number }).code : undefined;
                if (code !== 11000 || await Challan.countDocuments({ environment: "test" }) < 3000) throw error;
            }
        }
    })().catch((error) => {
        seedPromise = null;
        throw error;
    });
    return seedPromise;
}
