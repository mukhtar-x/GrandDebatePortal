import { requireAdminMutation } from "@/lib/adminAuth";
import { analyzePendingReceipts } from "@/lib/receipts/analyze";

export const maxDuration = 60;

const BATCH_LIMIT = 10;
/** Leaves headroom under maxDuration for the last receipt to finish. */
const TIME_BUDGET_MS = 40_000;

/**
 * Runs the full OCR check on receipts that have only had the instant check, oldest first.
 * Each call handles a batch; call again while `remaining` is above 0.
 */
export async function POST(request: Request): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    try {
        const { processed, remaining } = await analyzePendingReceipts(BATCH_LIMIT, TIME_BUDGET_MS);
        return Response.json({ success: true, processed, remaining });
    } catch (error) {
        console.error("Batch receipt check failed:", error);
        return Response.json({ success: false, error: "Receipts could not be checked." }, { status: 500 });
    }
}
