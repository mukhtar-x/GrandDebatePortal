import { after } from "next/server";
import { notifyContact } from "@/lib/mailer";
import { NOT_FOUND_MESSAGE, buildPortalStatus, findPortalAccess, parsePortalCredentials } from "@/lib/portal";
import { quickCheckReceiptSafely } from "@/lib/receipts/analyze";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { deleteReceipt, putReceipt, receiptUrlFor } from "@/lib/receipts/store";
import { MAX_RECEIPT_BYTES, processReceipt } from "@/lib/receipts/validate";
import { getClientIp, rejectCrossOrigin } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { MAX_LENGTHS, normalizeString } from "@/lib/validation";
import Application from "@/models/Application";
import Payment, { type IPayment } from "@/models/Payment";

export const maxDuration = 60;

class ResubmitConflictError extends Error {}

/**
 * Replaces the payment receipt while the application is in "Action Required".
 * Multipart fields: email, applicationId, receipt, transactionId (optional).
 */
export async function POST(request: Request): Promise<Response> {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RECEIPT_BYTES + 256 * 1024) {
        return Response.json(
            { success: false, error: "The file is too large. Please upload a smaller file." },
            { status: 413 },
        );
    }

    const limit = await consumeRateLimit(`resubmit:${getClientIp(request)}`, 10, 60 * 60 * 1000);
    if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return Response.json(
            { success: false, error: "Request must be multipart/form-data." },
            { status: 400 },
        );
    }

    const credentials = parsePortalCredentials(formData.get("email"), formData.get("applicationId"));
    if (!credentials) {
        return Response.json(
            { success: false, error: "A valid email and applicationId are required." },
            { status: 400 },
        );
    }
    const transactionId = normalizeString(formData.get("transactionId"));
    if (
        transactionId !== null &&
        transactionId !== "" &&
        (typeof transactionId !== "string" || transactionId.length > MAX_LENGTHS.transactionId)
    ) {
        return Response.json(
            { success: false, error: "Transaction ID is invalid.", field: "transactionId" },
            { status: 400 },
        );
    }

    let access;
    try {
        access = await findPortalAccess(credentials.email, credentials.applicationId);
    } catch (error) {
        console.error("Receipt resubmission lookup failed:", error);
        return Response.json(
            { success: false, error: "Your receipt could not be uploaded. Please try again." },
            { status: 500 },
        );
    }
    if (!access) {
        return Response.json({ success: false, error: NOT_FOUND_MESSAGE }, { status: 404 });
    }
    if (!access.isContact) {
        return Response.json(
            { success: false, error: "Only the head delegate can upload a new payment screenshot." },
            { status: 403 },
        );
    }
    if (access.payment?.paymentStatus !== "Action Required" && access.application.status !== "Action Required") {
        return Response.json(
            { success: false, error: "A new payment screenshot is not required for this application." },
            { status: 409 },
        );
    }

    const receiptResult = await processReceipt(formData.get("receipt"));
    if (!receiptResult.success) {
        return Response.json(
            { success: false, error: receiptResult.error, field: "receipt" },
            { status: receiptResult.status },
        );
    }
    const receipt = receiptResult.receipt;
    const { applicationId } = access.application;

    let receiptFileId: string;
    try {
        receiptFileId = await putReceipt(receipt.buffer, {
            mime: receipt.mime,
            applicationId,
            sha256: receipt.sha256,
        });
    } catch (error) {
        console.error("Receipt upload failed:", error);
        return Response.json(
            { success: false, error: "Your receipt could not be uploaded. Please try again." },
            { status: 500 },
        );
    }

    try {
        await withTransaction(async (session) => {
            const previous = await Payment.findOne({ applicationId })
                .session(session)
                .lean<IPayment>();
            if (!previous || previous.paymentStatus === "Confirmed") throw new ResubmitConflictError();

            // The previous receipt stays in GridFS and is kept in the history for the organisers.
            await Payment.updateOne(
                { applicationId, paymentStatus: previous.paymentStatus },
                {
                    $push: {
                        receiptHistory: {
                            receiptUrl: previous.receiptUrl,
                            receiptFileId: previous.receiptFileId,
                            receiptSha256: previous.receiptSha256,
                            transactionId: previous.transactionId,
                            reviewReason: previous.reviewReason,
                            replacedAt: new Date(),
                        },
                    },
                    $set: {
                        paymentStatus: "Pending",
                        receiptUrl: receiptUrlFor(receiptFileId),
                        receiptFileId,
                        receiptMime: receipt.mime,
                        receiptSha256: receipt.sha256,
                        receiptDhash: receipt.dhash,
                        receiptEditingSoftware: receipt.editingSoftware,
                        ...(typeof transactionId === "string" && transactionId ? { transactionId } : {}),
                    },
                    $unset: { reviewReason: "", reviewedAt: "", reviewedBy: "" },
                },
                { session },
            );
            await Application.updateOne(
                { applicationId },
                { $set: { status: "Payment under review" } },
                { session },
            );
        });
    } catch (error) {
        await deleteReceipt(receiptFileId);
        if (error instanceof ResubmitConflictError) {
            return Response.json(
                { success: false, error: "A new payment screenshot is not required for this application." },
                { status: 409 },
            );
        }
        console.error("Receipt resubmission failed:", error);
        return Response.json(
            { success: false, error: "Your receipt could not be uploaded. Please try again." },
            { status: 500 },
        );
    }

    after(() => quickCheckReceiptSafely(applicationId));
    after(() => notifyContact(applicationId, { type: "receiptResubmitted" }));
    const updated = await findPortalAccess(credentials.email, credentials.applicationId).catch(() => null);
    return Response.json(updated ? await buildPortalStatus(updated) : { success: true });
}
