import {
  formatPKR,
  MAX_DELEGATION_SIZE,
  MIN_DELEGATION_SIZE,
  REGISTRATION_FEES,
} from "@/data/event";
import { InputField } from "@/components/ui/form-fields";
import { useEffect, useState } from "react";

interface ReservationView {
  challanNumber: string;
  amount: number;
  rateType: string;
  expiresAt: string;
  graceUntil: string;
  test: boolean;
}

interface PaymentSectionProps {
  delegateCount: number;
  feePerDelegate: number;
  rateLabel: string;
  receiptName: string;
  onReceiptChange: (file: File | null) => void;
  reservation: ReservationView | null;
  onRegenerate: () => void;
  onEditDetails: () => void;
}

export function PaymentSection({
  delegateCount,
  feePerDelegate,
  rateLabel,
  receiptName,
  onReceiptChange,
  reservation,
  onRegenerate,
  onEditDetails,
}: PaymentSectionProps) {
  const delegationFee = delegateCount > 1 ? 500 : 0;
  const serverFeePerDelegate = reservation?.rateType === "Early bird" ? 2000 : reservation?.rateType === "Regular" ? 2400 : feePerDelegate;
  const total = reservation?.amount ?? delegateCount * feePerDelegate + delegationFee;
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const graceLeft = reservation && now > 0 ? Math.max(0, Math.ceil((new Date(reservation.graceUntil).getTime() - now) / 1000)) : 0;
  const reservationLeft = reservation && now > 0 ? Math.max(0, Math.ceil((new Date(reservation.expiresAt).getTime() - now) / 1000)) : 0;
  const countdown = reservationLeft > 0 ? reservationLeft : graceLeft;
  const timerLabel = now === 0 ? "--:--" : `${Math.floor(countdown / 60).toString().padStart(2, "0")}:${(countdown % 60).toString().padStart(2, "0")}`;

  return (
    <section className="form-card payment-card">
      <div className="form-card-heading">
        <div className="section-heading-icon">04</div>
        <div>
          <p className="section-overline">Step 4 of 4</p>
          <h2>Payment</h2>
        </div>
        <button className="button button-quiet" type="button" onClick={onEditDetails}>Edit details</button>
      </div>

      <div className="payment-total">
        <div>
          <span className="payment-label">Total payable</span>
          <span className="payment-rate">
            {delegateCount} {delegateCount === 1 ? "delegate" : "delegates"} ·{" "}
            {formatPKR(serverFeePerDelegate)} each · {reservation?.rateType ?? rateLabel} rate{delegationFee ? ` · ${formatPKR(delegationFee)} delegation fee` : ""}
          </span>
        </div>
        <strong>{formatPKR(total)}</strong>
      </div>

      {reservation ? <div className="payment-instructions">
        <span className="payment-icon" aria-hidden="true">
          #
        </span>
        <div>
          <strong>QuickPay challan: {reservation.challanNumber}</strong>
          <p>
            Pay exactly {formatPKR(reservation.amount)} using this challan. {now === 0 ? "Loading reservation timer…" : reservationLeft > 0 ? `Upload your receipt within ${timerLabel}; a 15-minute grace period follows.` : graceLeft > 0 ? `The 30-minute window ended. Upload during the ${timerLabel} grace period.` : "The reservation has expired."}
          </p>
          {reservation.test ? <p><strong>TEST CHALLAN — do not make a real payment.</strong> FAST challans have not been loaded yet.</p> : null}
        </div>
      </div> : <div className="payment-instructions"><span className="payment-icon" aria-hidden="true">!</span><div><strong>No challan reserved</strong><p>Go back to review your details and generate a challan before uploading payment.</p></div></div>}

      {reservation && now > 0 && graceLeft === 0 ? <div className="lookup-error" role="alert"><p>This challan reservation has expired. Generate a new challan to continue.</p><button className="button button-quiet" type="button" onClick={onRegenerate}>Generate new challan</button></div> : null}

      <div className="field-grid">
        <label className="field">
          <span className="field-label">Payment screenshot</span>
          <input
            className="form-control file-control"
            id="payment-receipt"
            name="paymentReceipt"
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={(event) => onReceiptChange(event.currentTarget.files?.[0] ?? null)}
            required
          />
          <span className="field-hint">
            Image or PDF. The amount and transfer date should be clearly legible.
          </span>
          {receiptName ? (
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
          hint="This helps organisers verify your payment promptly."
        />
      </div>

      {delegateCount > 1 ? (
        <details className="fee-table">
          <summary>View delegation fee totals</summary>
          <div className="fee-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Delegates</th>
                  <th scope="col">Early bird</th>
                  <th scope="col">Regular</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: MAX_DELEGATION_SIZE - MIN_DELEGATION_SIZE + 1 },
                  (_, index) => MIN_DELEGATION_SIZE + index,
                ).map((count) => (
                  <tr key={count} className={count === delegateCount ? "is-selected" : ""}>
                    <th scope="row">{count}</th>
                    <td>{formatPKR(count * REGISTRATION_FEES.earlyBird + 500)}</td>
                    <td>{formatPKR(count * REGISTRATION_FEES.regular + 500)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
