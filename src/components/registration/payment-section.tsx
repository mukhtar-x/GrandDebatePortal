import { useState, type Ref } from "react";
import { InputField } from "@/components/ui/form-fields";
import { DELEGATION_FEE, EVENT_DETAILS, RECEIPT_MAX_BYTES, RECEIPT_TYPES, formatPKR } from "@/data/event";
import type { ChallanReservation } from "@/lib/api/registration";
import { QUICKPAY_BILLER_CODE, QUICKPAY_SERVICE_CHARGE, quickPayPaymentId } from "@/lib/paymentDetails";

interface PaymentSectionProps {
  delegateCount: number;
  reservation: ChallanReservation | null;
  /** Current time in ms, ticking each second; 0 until the browser clock is read. */
  now: number;
  receiptName: string;
  onReceiptChange: (file: File | null) => void;
  transactionId: string;
  onTransactionIdChange: (value: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  onEditDetails: () => void;
  headingRef: Ref<HTMLHeadingElement>;
}

const MAX_TRANSACTION_ID_LENGTH = 64;

type Phase = "loading" | "reserved" | "expired";

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** Returns an error message for a receipt the server would refuse, so it is not uploaded first. */
function receiptProblem(file: File): string | null {
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) {
    return "Upload a JPG, PNG or WebP image, or a PDF.";
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return `This file is larger than ${RECEIPT_MAX_BYTES / (1024 * 1024)} MB. Upload a smaller screenshot.`;
  }
  return null;
}

export function PaymentSection({
  delegateCount,
  reservation,
  now,
  receiptName,
  onReceiptChange,
  transactionId,
  onTransactionIdChange,
  onRegenerate,
  regenerating,
  onEditDetails,
  headingRef,
}: PaymentSectionProps) {
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const expiresAt = reservation ? Date.parse(reservation.expiresAt) : 0;
  const phase: Phase = now === 0 ? "loading" : now < expiresAt ? "reserved" : "expired";
  const delegationFee = delegateCount > 1 ? DELEGATION_FEE : 0;
  const perDelegate = reservation ? (reservation.amount - delegationFee) / delegateCount : 0;

  async function copyQuickPayId() {
    if (!reservation) return;
    const value = reservation.test ? reservation.challanNumber : quickPayPaymentId(reservation.challanNumber);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Clipboard access can be blocked; the ID stays visible and selectable.
    }
  }

  function handleReceipt(input: HTMLInputElement) {
    const file = input.files?.[0] ?? null;
    const problem = file ? receiptProblem(file) : null;
    setReceiptError(problem);
    if (problem) input.value = "";
    onReceiptChange(problem ? null : file);
  }

  return (
    <section className="form-card payment-card">
      <div className="form-card-heading">
        <div className="section-heading-icon">04</div>
        <div>
          <p className="section-overline">Step 4 of 4</p>
          <h2 ref={headingRef} tabIndex={-1}>Pay and upload your receipt</h2>
        </div>
      </div>

      {reservation ? (
        <>
          {reservation.test ? (
            <div className="challan-test-banner" role="note">
              <strong>Test challan: do not make a real payment.</strong>
              <span>This test challan cannot be paid. Switch to live mode to get a bank payment ID.</span>
            </div>
          ) : null}

          <div className="challan-card">
            <div className="challan-number">
              <span className="payment-label">{reservation.test ? "Test challan" : "QuickPay ID"}</span>
              <div className="challan-number-row">
                <strong>
                  {reservation.test ? (
                    reservation.challanNumber
                  ) : (
                    <><span className="quickpay-biller-prefix">{QUICKPAY_BILLER_CODE}</span><span className="quickpay-challan-digits">{reservation.challanNumber}</span></>
                  )}
                </strong>
                <button className="button button-quiet challan-copy" type="button" onClick={() => void copyQuickPayId()}>
                  {copiedId ? "Copied" : "Copy ID"}
                </button>
              </div>
              {!reservation.test ? <span className="payment-rate">Enter this ID in your bank app’s Bill Payment / KuickPay field.</span> : null}
            </div>
            <div className="challan-amount">
              <span className="payment-label">{reservation.test ? "Registration fee" : "You pay"}</span>
              <strong>{formatPKR(reservation.test ? reservation.amount : reservation.amount + QUICKPAY_SERVICE_CHARGE)}</strong>
              <span className="payment-rate">
                {delegateCount} × {formatPKR(perDelegate)} ({reservation.rateType})
                {delegationFee ? ` + ${formatPKR(delegationFee)} delegation fee` : ""}
                {reservation.test ? "" : ` + ${formatPKR(QUICKPAY_SERVICE_CHARGE)} KuickPay charge`}
              </span>
            </div>
          </div>

          <div className={`challan-timer is-${phase}`} role="timer">
            {phase === "expired" ? (
              <>
                <div>
                  <strong>This challan has expired.</strong>
                  <span>
                    Do not pay {reservation.test ? "test challan " : "QuickPay ID "}{reservation.test ? reservation.challanNumber : quickPayPaymentId(reservation.challanNumber)}. Generate a new challan to continue.
                    If you already paid it, contact the organisers at {EVENT_DETAILS.contactEmail} with your receipt.
                  </span>
                </div>
                <button className="button button-primary" type="button" onClick={onRegenerate} disabled={regenerating} aria-busy={regenerating}>
                  {regenerating ? "Generating…" : "Generate new challan"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <strong>Time left to pay and submit</strong>
                  <span>When the timer ends, this challan can no longer be submitted.</span>
                </div>
                <span className="challan-countdown">{phase === "loading" ? "--:--" : formatCountdown(expiresAt - now)}</span>
              </>
            )}
          </div>
          <p className="visually-hidden" aria-live="polite">
            {phase === "expired" ? "The challan has expired." : ""}
          </p>

          <ol className="payment-steps">
            {reservation.test ? (
              <li>This is a test challan. Do not make a real payment.</li>
            ) : (
              <li>In your bank app, select Bill Payment / KuickPay and enter QuickPay ID <strong>{quickPayPaymentId(reservation.challanNumber)}</strong>.</li>
            )}
            {reservation.test ? null : (
              <li>
                Check the bill shows <strong>{formatPKR(reservation.amount)}</strong>. Your bank adds the{" "}
                {formatPKR(QUICKPAY_SERVICE_CHARGE)} KuickPay charge, so you pay{" "}
                <strong>{formatPKR(reservation.amount + QUICKPAY_SERVICE_CHARGE)}</strong>.
              </li>
            )}
            <li>Take a screenshot of the receipt with the amount, date and QuickPay ID visible, then upload it below and submit before the timer ends.</li>
          </ol>
        </>
      ) : (
        <div className="payment-instructions">
          <span className="payment-icon" aria-hidden="true">!</span>
          <div>
            <strong>No challan reserved</strong>
            <p>Go back to review your details and generate a challan before paying.</p>
          </div>
        </div>
      )}

      <div className="field-grid">
        <label className="field" htmlFor="payment-receipt">
          <span className="field-label">Payment screenshot</span>
          <input
            className="form-control file-control"
            id="payment-receipt"
            name="paymentReceipt"
            type="file"
            accept={RECEIPT_TYPES.join(",")}
            onChange={(event) => handleReceipt(event.currentTarget)}
            aria-invalid={receiptError ? true : undefined}
            aria-describedby="payment-receipt-hint"
            disabled={!reservation || phase === "expired"}
            required={!receiptName}
          />
          <span className="field-hint" id="payment-receipt-hint">
            JPG, PNG, WebP or PDF, up to {RECEIPT_MAX_BYTES / (1024 * 1024)} MB.
          </span>
          {receiptError ? <span className="field-error" role="alert">{receiptError}</span> : null}
          {receiptName && !receiptError ? (
            <span className="selected-file" role="status">
              Selected: {receiptName}
            </span>
          ) : null}
        </label>
        <InputField
          id="transaction-id"
          name="transactionId"
          label="Transaction ID"
          placeholder="As shown on your receipt"
          maxLength={MAX_TRANSACTION_ID_LENGTH}
          value={transactionId}
          onChange={(event) => onTransactionIdChange(event.currentTarget.value)}
          hint="This helps organisers verify your payment promptly."
        />
      </div>

      <div className="form-navigation">
        <button className="button button-quiet" type="button" onClick={onEditDetails}>
          Back to review
        </button>
      </div>
    </section>
  );
}
