import connectDB from "@/lib/db";
import { PAYMENT_DETAILS } from "@/lib/paymentDetails";
import { isAiCheckConfigured, runAiCheck, type AiCheckResult } from "@/lib/receipts/aiCheck";
import { hammingDistance } from "@/lib/receipts/hash";
import { extractReceiptText } from "@/lib/receipts/ocr";
import { normalizeTransactionId, parseReceiptText, textSimilarity, type ParsedReceipt } from "@/lib/receipts/parse";
import { readReceiptBuffer } from "@/lib/receipts/store";
import Application from "@/models/Application";
import Payment, { type IPayment, type IReceiptAnalysis, type IReceiptFlag } from "@/models/Payment";

const SEVERITY_SCORE: Record<IReceiptFlag["severity"], number> = { low: 5, medium: 20, high: 50 };
/** Receipts with the same app layout hash alike, so a visual match also needs matching text. */
const VISUAL_MATCH_DISTANCE = 8;
const TEXT_MATCH_SIMILARITY = 0.85;
const MAX_RECEIPT_AGE_DAYS = 60;

type OtherPayment = Pick<
    IPayment,
    "applicationId" | "receiptSha256" | "receiptDhash" | "transactionId" | "receiptHistory" | "analysis"
>;

/** When the payment's current receipt was uploaded (registration, or the latest resubmission). */
function receiptUploadedAt(payment: Pick<IPayment, "createdAt" | "receiptHistory">): Date {
    return new Date(payment.receiptHistory?.at(-1)?.replacedAt ?? payment.createdAt);
}

const DUPLICATE_DETAILS: Record<string, (ids: string) => string> = {
    DUPLICATE_FILE: (ids) => `The exact same file was submitted for ${ids}.`,
    DUPLICATE_TXN: (ids) => `The same transaction ID was already used by ${ids}.`,
    NEAR_DUPLICATE: (ids) => `Looks like an edited, cropped or re-saved copy of the receipt for ${ids}.`,
};

function duplicateFlags(
    payment: IPayment,
    parsed: ParsedReceipt,
    text: string,
    others: OtherPayment[],
): IReceiptFlag[] {
    const matches: Record<string, string[]> = { DUPLICATE_FILE: [], DUPLICATE_TXN: [], NEAR_DUPLICATE: [] };
    const ownTxnIds = new Set(
        [normalizeTransactionId(payment.transactionId), parsed.transactionId].filter((id): id is string => Boolean(id)),
    );

    for (const other of others) {
        const otherShas = [other.receiptSha256, ...(other.receiptHistory ?? []).map((entry) => entry.receiptSha256)];
        if (payment.receiptSha256 && otherShas.includes(payment.receiptSha256)) {
            matches.DUPLICATE_FILE.push(other.applicationId);
            continue;
        }

        const otherTxnIds = [
            normalizeTransactionId(other.transactionId),
            other.analysis?.extracted?.transactionId ?? null,
        ].filter((id): id is string => Boolean(id));
        if (otherTxnIds.some((id) => ownTxnIds.has(id))) {
            matches.DUPLICATE_TXN.push(other.applicationId);
            continue;
        }

        if (payment.receiptDhash && other.receiptDhash) {
            const distance = hammingDistance(payment.receiptDhash, other.receiptDhash);
            const otherText = other.analysis?.textExcerpt ?? "";
            if (distance <= VISUAL_MATCH_DISTANCE && textSimilarity(text, otherText) >= TEXT_MATCH_SIMILARITY) {
                matches.NEAR_DUPLICATE.push(other.applicationId);
            }
        }
    }

    // One flag per kind, listing every matching application, so repeats do not inflate the score.
    return Object.entries(matches)
        .filter(([, ids]) => ids.length > 0)
        .map(([code, ids]) => ({ code, severity: "high" as const, detail: DUPLICATE_DETAILS[code](ids.join(", ")) }));
}

function contentFlags(payment: IPayment, parsed: ParsedReceipt, text: string): IReceiptFlag[] {
    const flags: IReceiptFlag[] = [];
    const readable = text.replace(/\s+/g, "").length >= 20;

    if (!readable) {
        flags.push({ code: "UNREADABLE", severity: "medium", detail: "No usable text could be read from the receipt." });
    } else if (parsed.amount === null) {
        flags.push({ code: "AMOUNT_NOT_FOUND", severity: "low", detail: "No payment amount could be read." });
    } else if (!parsed.amountCandidates.includes(payment.totalPayable)) {
        flags.push({
            code: "AMOUNT_MISMATCH",
            severity: "high",
            detail: `Receipt shows PKR ${parsed.amount.toLocaleString("en-US")}; expected PKR ${payment.totalPayable.toLocaleString("en-US")}.`,
        });
    }

    if (parsed.date) {
        const receiptDate = new Date(`${parsed.date}T00:00:00+05:00`).getTime();
        const uploadedAt = receiptUploadedAt(payment).getTime();
        const tooOld = uploadedAt - receiptDate > MAX_RECEIPT_AGE_DAYS * 24 * 60 * 60 * 1000;
        const inFuture = receiptDate - uploadedAt > 24 * 60 * 60 * 1000;
        if (tooOld || inFuture) {
            flags.push({
                code: "DATE_OUT_OF_RANGE",
                severity: "medium",
                detail: `Receipt is dated ${parsed.date}, which does not fit the upload date.`,
            });
        }
    }

    const typedTxn = normalizeTransactionId(payment.transactionId);
    if (typedTxn && parsed.transactionId && !typedTxn.includes(parsed.transactionId) && !parsed.transactionId.includes(typedTxn)) {
        flags.push({
            code: "TXN_MISMATCH",
            severity: "medium",
            detail: `Applicant entered ${typedTxn}; the receipt shows ${parsed.transactionId}.`,
        });
    }

    if (payment.receiptEditingSoftware) {
        flags.push({
            code: "EDITING_SOFTWARE",
            severity: "medium",
            detail: `The file was saved by ${payment.receiptEditingSoftware}.`,
        });
    }

    const account = PAYMENT_DETAILS.accountNumber?.replace(/\D/g, "");
    if (readable && account && account.length >= 4) {
        const digits = text.replace(/\D/g, "");
        const title = PAYMENT_DETAILS.accountTitle?.toLowerCase();
        const nameShown = title ? text.toLowerCase().includes(title) : false;
        if (!digits.includes(account.slice(-4)) && !nameShown) {
            flags.push({
                code: "WRONG_RECIPIENT",
                severity: "high",
                detail: "The organisers' account number or title does not appear on the receipt.",
            });
        }
    }
    return flags;
}

function aiFlag(ai: AiCheckResult): IReceiptFlag | null {
    if (ai.verdict === "fake" || ai.verdict === "suspicious") {
        return {
            code: "AI_SUSPECT",
            severity: ai.verdict === "fake" ? "high" : "medium",
            detail: `AI check: ${ai.verdict}${ai.reasons.length ? ` (${ai.reasons.join("; ")})` : ""}.`,
        };
    }
    return null;
}

function riskLevel(score: number): IReceiptAnalysis["riskLevel"] {
    return score >= 50 ? "high" : score >= 20 ? "medium" : "low";
}

/**
 * Reads the current receipt for an application, checks it for duplicates and inconsistencies,
 * and stores the result on the payment for the organisers. Never changes the payment decision.
 */
export async function analyzeReceipt(applicationId: string): Promise<IReceiptAnalysis | null> {
    await connectDB();
    const payment = await Payment.findOne({ applicationId }).lean<IPayment>();
    if (!payment?.receiptFileId) return null;

    let analysis: IReceiptAnalysis;
    try {
        const buffer = await readReceiptBuffer(payment.receiptFileId);
        if (!buffer) throw new Error("Receipt file is missing.");
        const mime = payment.receiptMime ?? "image/jpeg";

        let text = "";
        let provider: string = mime === "application/pdf" ? "pdf-text" : "tesseract";
        let ocrError: string | undefined;
        try {
            const extracted = await extractReceiptText(buffer, mime);
            text = extracted.text;
            provider = extracted.provider;
        } catch (error) {
            ocrError = error instanceof Error ? error.message : "OCR failed";
        }

        const parsed = parseReceiptText(text, payment.totalPayable);
        // Only receipts uploaded earlier count, so the original is never flagged because of a later copy.
        const uploadedAt = receiptUploadedAt(payment);
        const others = await Payment.find({ applicationId: { $ne: applicationId }, createdAt: { $lt: uploadedAt } })
            .select(
                "applicationId receiptSha256 receiptDhash transactionId receiptHistory.receiptSha256 analysis.extracted.transactionId analysis.textExcerpt",
            )
            .lean<OtherPayment[]>();

        const flags = [...duplicateFlags(payment, parsed, text, others), ...contentFlags(payment, parsed, text)];

        let ai: IReceiptAnalysis["ai"] = null;
        if (isAiCheckConfigured()) {
            try {
                const result = await runAiCheck({
                    image: mime === "image/jpeg" ? buffer : null,
                    ocrText: text,
                    expectedAmount: payment.totalPayable,
                });
                ai = { verdict: result.verdict, reasons: result.reasons, model: result.model };
                const flag = aiFlag(result);
                if (flag) flags.push(flag);
            } catch (error) {
                ai = { error: error instanceof Error ? error.message : "AI check failed" };
            }
        }

        const riskScore = flags.reduce((total, flag) => total + SEVERITY_SCORE[flag.severity], 0);
        analysis = {
            status: "done",
            provider,
            receiptSha256: payment.receiptSha256,
            extracted: {
                amount: parsed.amount,
                date: parsed.date,
                transactionId: parsed.transactionId,
                recipientAccount: parsed.recipientAccount,
                recipientName: parsed.recipientName,
                channel: parsed.channel,
            },
            flags,
            riskScore,
            riskLevel: riskLevel(riskScore),
            textExcerpt: text.slice(0, 3000),
            ai,
            analyzedAt: new Date(),
            ...(ocrError ? { error: ocrError } : {}),
        };
    } catch (error) {
        console.error("Receipt analysis failed:", error);
        analysis = {
            status: "failed",
            provider: "none",
            receiptSha256: payment.receiptSha256,
            flags: [],
            riskScore: 0,
            riskLevel: "low",
            analyzedAt: new Date(),
            error: error instanceof Error ? error.message : "Analysis failed",
        };
    }

    // Only store the result if the receipt was not replaced while it was being analysed.
    await Payment.updateOne(
        { applicationId, receiptSha256: payment.receiptSha256 },
        { $set: { analysis } },
    );
    await Application.updateOne(
        { applicationId, status: "Submitted" },
        { $set: { status: "Payment under review" } },
    );
    return analysis;
}

/** Runs analysis in the background, logging instead of throwing. */
export function analyzeReceiptSafely(applicationId: string): Promise<void> {
    return analyzeReceipt(applicationId).then(
        () => undefined,
        (error: unknown) => console.error("Background receipt analysis failed:", error),
    );
}
