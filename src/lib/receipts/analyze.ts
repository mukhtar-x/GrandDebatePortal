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

/** Checks on the file itself, available without OCR. */
function fileFlags(payment: IPayment): IReceiptFlag[] {
    return payment.receiptEditingSoftware
        ? [{ code: "EDITING_SOFTWARE", severity: "medium", detail: `The file was saved by ${payment.receiptEditingSoftware}.` }]
        : [];
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

function scored(flags: IReceiptFlag[]): Pick<IReceiptAnalysis, "flags" | "riskScore" | "riskLevel"> {
    const riskScore = flags.reduce((total, flag) => total + SEVERITY_SCORE[flag.severity], 0);
    return { flags, riskScore, riskLevel: riskLevel(riskScore) };
}

/** Receipts uploaded before this one; the original is never flagged because of a later copy. */
function earlierPayments(payment: IPayment): Promise<OtherPayment[]> {
    return Payment.find({ applicationId: { $ne: payment.applicationId }, createdAt: { $lt: receiptUploadedAt(payment) } })
        .select(
            "applicationId receiptSha256 receiptDhash transactionId receiptHistory.receiptSha256 analysis.extracted.transactionId analysis.textExcerpt",
        )
        .lean<OtherPayment[]>();
}

async function storeAnalysis(payment: IPayment, analysis: IReceiptAnalysis, filter: Record<string, unknown> = {}) {
    // Only store the result if the receipt was not replaced while it was being checked.
    await Payment.updateOne(
        { applicationId: payment.applicationId, receiptSha256: payment.receiptSha256, ...filter },
        { $set: { analysis } },
    );
    await Application.updateOne(
        { applicationId: payment.applicationId, status: "Submitted" },
        { $set: { status: "Payment under review" } },
    );
}

/**
 * Instant checks run on upload (no OCR): exact duplicate file, a transaction ID the applicant
 * typed that was already used, and editing software in the file. Full checks run on demand.
 */
export async function quickCheckReceipt(applicationId: string): Promise<IReceiptAnalysis | null> {
    await connectDB();
    const payment = await Payment.findOne({ applicationId }).lean<IPayment>();
    if (!payment?.receiptFileId) return null;

    const noText = parseReceiptText("", payment.totalPayable);
    const flags = [...duplicateFlags(payment, noText, "", await earlierPayments(payment)), ...fileFlags(payment)];
    const analysis: IReceiptAnalysis = {
        status: "quick",
        provider: "none",
        receiptSha256: payment.receiptSha256,
        ...scored(flags),
        analyzedAt: new Date(),
    };
    // Never overwrite a full check of the same receipt.
    await storeAnalysis(payment, analysis, {
        $or: [{ analysis: { $exists: false } }, { "analysis.receiptSha256": { $ne: payment.receiptSha256 } }],
    });
    return analysis;
}

export function quickCheckReceiptSafely(applicationId: string): Promise<void> {
    return quickCheckReceipt(applicationId).then(
        () => undefined,
        (error: unknown) => console.error("Quick receipt check failed:", error),
    );
}

/** Payments whose current receipt has not had a full (OCR) check yet. */
const NEEDS_FULL_CHECK = {
    receiptFileId: { $exists: true },
    $or: [
        { analysis: { $exists: false } },
        { "analysis.status": "quick" },
        { $expr: { $ne: ["$analysis.receiptSha256", "$receiptSha256"] } },
    ],
};

export async function countPendingFullChecks(): Promise<number> {
    await connectDB();
    return Payment.countDocuments(NEEDS_FULL_CHECK);
}

/**
 * Runs full checks oldest first, so each receipt is compared with the text of earlier ones,
 * stopping at `limit` receipts or when the time budget is spent.
 */
export async function analyzePendingReceipts(limit: number, budgetMs: number) {
    const startedAt = Date.now();
    await connectDB();
    const pending = await Payment.find(NEEDS_FULL_CHECK)
        .sort({ createdAt: 1 })
        .select("applicationId")
        .limit(limit)
        .lean<{ applicationId: string }[]>();

    const processed: { applicationId: string; status: string; riskLevel: string }[] = [];
    for (const { applicationId } of pending) {
        if (Date.now() - startedAt > budgetMs) break;
        const analysis = await analyzeReceipt(applicationId);
        if (analysis) processed.push({ applicationId, status: analysis.status, riskLevel: analysis.riskLevel });
    }
    return { processed, remaining: await countPendingFullChecks() };
}

/**
 * Full check: reads the receipt with OCR, checks it for duplicates and inconsistencies, and
 * stores the result on the payment for the organisers. Never changes the payment decision.
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
        const flags = [
            ...duplicateFlags(payment, parsed, text, await earlierPayments(payment)),
            ...contentFlags(payment, parsed, text),
            ...fileFlags(payment),
        ];

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
            ...scored(flags),
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

    await storeAnalysis(payment, analysis);
    return analysis;
}
