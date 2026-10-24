import { formatPKR } from "@/data/event";
import { InputField } from "@/components/ui/form-fields";

interface PaymentSectionProps {
  delegateCount: number;
  feePerDelegate: number;
  rateLabel: string;
  receiptName: string;
  onReceiptChange: (file: File | null) => void;
}

export function PaymentSection({
  delegateCount,
  feePerDelegate,
  rateLabel,
  receiptName,
  onReceiptChange,
}: PaymentSectionProps) {
  const total = delegateCount * feePerDelegate;

  return (
    <section className="form-card payment-card">
      <div className="form-card-heading">
        <div className="section-heading-icon">03</div>
        <div>
          <p className="section-overline">Final section</p>
          <h2>Payment</h2>
        </div>
      </div>

      <div className="payment-total">
        <div>
          <span className="payment-label">Total payable</span>
          <span className="payment-rate">
            {delegateCount} {delegateCount === 1 ? "delegate" : "delegates"} ·{" "}
            {formatPKR(feePerDelegate)} each · {rateLabel} rate
          </span>
        </div>
        <strong>{formatPKR(total)}</strong>
      </div>

      <div className="payment-instructions">
        <span className="payment-icon" aria-hidden="true">
          i
        </span>
        <div>
          <strong>Payment details are being confirmed</strong>
          <p>
            The organisers will publish the account title and transfer details before
            payment is collected. Please do not transfer money using unofficial details.
          </p>
        </div>
      </div>

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
                {[4, 5, 6, 7].map((count) => (
                  <tr key={count} className={count === delegateCount ? "is-selected" : ""}>
                    <th scope="row">{count}</th>
                    <td>{formatPKR(count * 2000)}</td>
                    <td>{formatPKR(count * 2400)}</td>
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
