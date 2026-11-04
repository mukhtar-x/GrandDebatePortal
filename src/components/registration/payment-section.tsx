import { useState, type Ref } from "react";
import { InputField } from "@/components/ui/form-fields";
import { DELEGATION_FEE, RECEIPT_MAX_BYTES, RECEIPT_TYPES, formatPKR } from "@/data/event";
import type { ChallanReservation } from "@/lib/api/registration";

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

type Phase = "loading" | "reserved" | "grace" | "expired";

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
  const [copied, setCopied] = useState(false);

  const expiresAt = reservation ? Date.parse(reservation.expiresAt) : 0;
  const graceUntil = reservation ? Date.parse(reservation.graceUntil) : 0;
  const phase: Phase = now === 0 ? "loading" : now < expiresAt ? "reserved" : now < graceUntil ? "grace" : "expired";
  const delegationFee = delegateCount > 1 ? DELEGATION_FEE : 0;
  const perDelegate = reservation ? (reservation.amount - delegationFee) / delegateCount : 0;

  async function copyChallanNumber() {
    if (!reservation) return;
    try {
      await navigator.clipboard.writeText(reservation.challanNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the number stays visible and selectable.
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
              <span>This site is running in test mode. Live FAST challans have not been loaded.</span>
            </div>
          ) : null}

          <div className="challan-card">
            <div className="challan-number">
              <span className="payment-label">QuickPay challan number</span>
              <div className="challan-number-row">
                <strong>{reservation.challanNumber}</strong>
                <button className="button button-quiet challan-copy" type="button" onClick={() => void copyChallanNumber()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="challan-amount">
              <span className="payment-label">Pay exactly</span>
              <strong>{formatPKR(reservation.amount)}</strong>
              <span className="payment-rate">
                {delegateCount} × {formatPKR(perDelegate)} ({reservation.rateType} rate)
                {delegationFee ? ` + ${formatPKR(delegationFee)} delegation fee` : ""}
              </span>
            </div>
          </div>

          <div className={`challan-timer is-${phase}`} role="timer">
            {phase === "expired" ? (
              <>
                <div>
                  <strong>This challan has expired.</strong>
                  <span>Do not pay challan {reservation.challanNumber}. Generate a new challan to continue.</span>
                </div>
                <button className="button button-primary" type="button" onClick={onRegenerate} disabled={regenerating} aria-busy={regenerating}>
                  {regenerating ? "Generating…" : "Generate new challan"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <strong>{phase === "grace" ? "Grace period: submit now" : "Time left to pay and submit"}</strong>
                  <span>
                    {phase === "grace"
                      ? "The 30-minute window has ended. You can still submit your receipt until the timer runs out."
                      : "A 15-minute grace period follows if you need a little longer."}
                  </span>
                </div>
                <span className="challan-countdown">{phase === "loading" ? "--:--" : formatCountdown((phase === "reserved" ? expiresAt : graceUntil) - now)}</span>
              </>
            )}
          </div>
          <p className="visually-hidden" aria-live="polite">
            {phase === "grace" ? "The grace period has started. Submit your receipt now." : phase === "expired" ? "The challan has expired." : ""}
          </p>

          <ol className="payment-steps">
            <li>Pay exactly <strong>{formatPKR(reservation.amount)}</strong> against challan <strong>{reservation.challanNumber}</strong>.</li>
            <li>Save the payment screenshot or receipt. The amount, date and challan number should be readable.</li>
            <li>Upload it below and submit before the timer ends.</li>
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
          placeholder="Optional"
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
