"use client";

import Link from "next/link";
import { ActionIcon } from "@/components/shared/action-icon";
import { InputField } from "@/components/ui/form-fields";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DelegationFields } from "@/components/registration/delegation-fields";
import { PaymentSection } from "@/components/registration/payment-section";
import { SoloDelegateFields } from "@/components/registration/solo-delegate-fields";
import {
  emptyDelegate,
  emptyDelegation,
  emptySoloForm,
  type DelegateFormValues,
  type DelegationFormValues,
  type RegistrationType,
  type SoloFormValues,
} from "@/components/registration/types";
import {
  CURRENT_REGISTRATION_WINDOW,
  EVENT_DETAILS,
  MAX_DELEGATION_SIZE,
  MIN_DELEGATION_SIZE,
  formatPKR,
  getCurrentRegistrationWindow,
  type RegistrationWindow,
} from "@/data/event";
import {
  describeField,
  buildRegistrationDetails,
  reserveChallan,
  releaseChallan,
  submitRegistration,
  type ChallanReservation,
  type RegistrationSuccess,
} from "@/lib/api/registration";

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function FeeSummary({
  registrationType,
  delegateCount,
  registrationWindow,
  total,
}: {
  registrationType: RegistrationType;
  delegateCount: number;
  registrationWindow: RegistrationWindow;
  total: number;
}) {
  return (
    <section className="summary-card">
      <div className="summary-card-top">
        <span className="summary-icon" aria-hidden="true">✦</span>
        <div>
          <p className="section-overline">Your registration</p>
          <h2>Fee summary</h2>
        </div>
      </div>
      <div className="summary-line">
        <span>Registration type</span>
        <strong>{registrationType === "solo" ? "Solo delegate" : "Delegation"}</strong>
      </div>
      <div className="summary-line">
        <span>Delegates</span>
        <strong>{delegateCount}</strong>
      </div>
      <div className="summary-line">
        <span>{registrationWindow.name} rate</span>
        <strong>{formatPKR(registrationWindow.feePerDelegate)} each</strong>
      </div>
      {delegateCount > 1 ? <div className="summary-line"><span>Delegation fee</span><strong>{formatPKR(500)}</strong></div> : null}
      <div className="summary-total">
        <span>Total payable</span>
        <strong aria-live="polite" aria-atomic="true">{formatPKR(total)}</strong>
      </div>
      <p className="summary-deadline">
        Rate available until {registrationWindow.deadline}.
      </p>
    </section>
  );
}

export function RegistrationFlow() {
  const [step, setStep] = useState(1);
  const [registrationType, setRegistrationType] = useState<RegistrationType>("solo");
  const [registrationWindow, setRegistrationWindow] =
    useState<RegistrationWindow>(CURRENT_REGISTRATION_WINDOW);
  const [solo, setSolo] = useState<SoloFormValues>(emptySoloForm);
  const [delegation, setDelegation] = useState<DelegationFormValues>(emptyDelegation);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState<RegistrationSuccess | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [baCode, setBaCode] = useState("");
  const [reservation, setReservation] = useState<ChallanReservation | null>(null);
  const [reserving, setReserving] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const detailsSectionRef = useRef<HTMLElement>(null);
  // One key per form fill (created on first submit), so a retry cannot create two registrations.
  const idempotencyKey = useRef<string | null>(null);

  const delegateCount = registrationType === "solo" ? 1 : delegation.size;
  const total = delegateCount * registrationWindow.feePerDelegate + (delegateCount > 1 ? 500 : 0);

  function invalidateReservation() {
    if (!reservation) return;
    void releaseChallan(reservation.reservationToken);
    setReservation(null);
    setReceipt(null);
    setFlowError("Your details changed, so the previous challan was invalidated. Generate a new one after reviewing your details.");
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRegistrationWindow(getCurrentRegistrationWindow());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  function handleSoloChange(field: keyof SoloFormValues, value: string) {
    invalidateReservation();
    setSolo((current) => ({ ...current, [field]: value }));
  }

  function handleDelegationFieldChange(
    field: "institution" | "headName" | "headEmail" | "headWhatsapp",
    value: string,
  ) {
    invalidateReservation();
    setDelegation((current) => {
      const next = { ...current, [field]: value };
      if (current.headIsDelegate && field !== "institution") {
        const delegateField =
          field === "headName"
            ? "fullName"
            : field === "headEmail"
              ? "email"
              : "whatsapp";
        const delegates = [...current.delegates];
        delegates[0] = { ...delegates[0], [delegateField]: value };
        next.delegates = delegates;
      }
      return next;
    });
  }

  function handleDelegationSizeChange(size: number) {
    invalidateReservation();
    setDelegation((current) => {
      const safeSize = Math.max(
        MIN_DELEGATION_SIZE,
        Math.min(
          MAX_DELEGATION_SIZE,
          Number.isFinite(size) ? Math.trunc(size) : MIN_DELEGATION_SIZE,
        ),
      );
      const delegates = current.delegates.slice(0, safeSize);
      while (delegates.length < safeSize) delegates.push(emptyDelegate());
      return { ...current, size: safeSize, delegates };
    });
  }

  function handleHeadIsDelegateChange(checked: boolean) {
    invalidateReservation();
    setDelegation((current) => {
      const delegates = [...current.delegates];
      delegates[0] = {
        ...delegates[0],
        fullName: checked ? current.headName : "",
        email: checked ? current.headEmail : "",
        whatsapp: checked ? current.headWhatsapp : "",
      };
      return { ...current, headIsDelegate: checked, delegates };
    });
  }

  function handleDelegateChange(
    index: number,
    field: keyof DelegateFormValues,
    value: string,
  ) {
    invalidateReservation();
    setDelegation((current) => {
      const delegates = [...current.delegates];
      delegates[index] = { ...delegates[index], [field]: value };
      return { ...current, delegates };
    });
  }

  function handleRemoveDelegate(index: number) {
    invalidateReservation();
    setDelegation((current) => {
      if (
        current.delegates.length <= MIN_DELEGATION_SIZE ||
        index < 0 ||
        index >= current.delegates.length
      ) {
        return current;
      }

      const delegates = current.delegates.filter((_, delegateIndex) => delegateIndex !== index);
      return {
        ...current,
        delegates,
        size: delegates.length,
        headIsDelegate: index === 0 ? false : current.headIsDelegate,
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 4 || !reservation) return;
    if (submitting || !event.currentTarget.reportValidity()) return;
    if (!receipt) {
      setSubmitError("Please upload a screenshot of your payment before submitting.");
      return;
    }

    const transactionId = new FormData(event.currentTarget).get("transactionId");
    idempotencyKey.current ??= newIdempotencyKey();
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitRegistration({
      type: registrationType,
      solo,
      delegation,
      receipt,
      transactionId: typeof transactionId === "string" ? transactionId : "",
      baCode,
      idempotencyKey: idempotencyKey.current,
      reservationToken: reservation.reservationToken,
    });
    setSubmitting(false);

    if (result.ok) {
      setConfirmation(result.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setSubmitError(
        result.field
          ? describeField(result.field, registrationType) + ": " + result.error
          : result.error,
      );
    }
  }

  function startNewRegistration() {
    invalidateReservation();
    setStep(1);
    setConfirmation(null);
    setSolo(emptySoloForm());
    setDelegation(emptyDelegation());
    setReceipt(null);
    setBaCode("");
    idempotencyKey.current = null;
  }

  function continueToDetails() { setStep(2); setFlowError(null); }

  function continueToReview() {
    const fields = detailsSectionRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea") ?? [];
    let valid = true;
    fields.forEach((field) => { if (!field.checkValidity()) { field.reportValidity(); valid = false; } });
    if (valid) { setStep(3); setFlowError(null); }
  }

  async function generateChallan() {
    if (reserving) return;
    setReserving(true);
    setFlowError(null);
    const result = await reserveChallan(buildRegistrationDetails({ type: registrationType, solo, delegation, baCode }));
    setReserving(false);
    if (!result.ok) { setFlowError(result.error); return; }
    setReservation(result.data);
    setStep(4);
  }

  if (confirmation) {
    return (
      <section className="confirmation-card" aria-live="polite">
        <div className="confirmation-check" aria-hidden="true">
          ✓
        </div>
        <p className="section-overline">Registration received</p>
        <h2>Thank you, {confirmation.firstName}.</h2>
        <p className="confirmation-copy">
          Your registration has been received with challan {confirmation.challanNumber}{confirmation.test ? " (TEST — not payable)" : ""}. Your payment will now be reviewed. Once it
          is confirmed, your committee will be allocated within 1 to 3 business days. You
          may monitor your progress in the portal at any time.
        </p>
        <p className="confirmation-copy">
          We&apos;ll send an update to the email address on your registration. If it doesn&apos;t
          appear in your inbox, please check your spam or junk folder.
        </p>
        <div className="application-id-box">
          <span>Your application ID</span>
          <strong>{confirmation.applicationId}</strong>
          <small>
            Please retain it, as it is required to sign in to the portal with the email
            address used on the form.
          </small>
        </div>
        <div className="confirmation-actions">
          <Link className="button button-primary" href="/portal">
            Go to Portal <ActionIcon />
          </Link>
          <button className="button button-quiet" type="button" onClick={startNewRegistration}>
            Register someone else
          </button>
        </div>
      </section>
    );
  }

  if (registrationWindow.key === "closed") {
    return (
      <section className="registration-closed-card">
        <span className="closed-seal" aria-hidden="true">
          ✦
        </span>
        <p className="section-overline">Registration closed</p>
        <h2>Thank you for your interest.</h2>
        <p>{registrationWindow.description}</p>
        <Link className="button button-primary" href="/portal">
          Go to Portal <ActionIcon />
        </Link>
      </section>
    );
  }

  return (
    <div className="registration-layout">
      <form className="registration-form" onSubmit={handleSubmit}>
        <nav className="registration-steps" aria-label="Registration progress">
          {["Type", "Details", "Review & challan", "Payment"].map((label, index) => (
            <span key={label} className={step === index + 1 ? "is-current" : step > index + 1 ? "is-complete" : ""}>{index + 1}. {label}</span>
          ))}
        </nav>
        {step === 1 ? <section className="form-card">
          <div className="form-card-heading">
            <div className="section-heading-icon">01</div>
            <div>
              <p className="section-overline">Start here</p>
              <h2>Choose your registration</h2>
            </div>
          </div>
          <div className="registration-type-grid">
            <button
              className={
                registrationType === "solo"
                  ? "registration-type-card is-selected"
                  : "registration-type-card"
              }
              type="button"
              aria-pressed={registrationType === "solo"}
              onClick={() => setRegistrationType("solo")}
            >
              <span className="type-card-icon" aria-hidden="true">
                01
              </span>
              <span className="type-card-title">Solo delegate</span>
              <span className="type-card-copy">
                For an individual delegate. The organisers will place you in a committee.
              </span>
              <span className="type-card-fee">
                {formatPKR(registrationWindow.feePerDelegate)}{" "}
                <small>per delegate</small>
              </span>
            </button>
            <button
              className={
                registrationType === "delegation"
                  ? "registration-type-card is-selected"
                  : "registration-type-card"
              }
              type="button"
              aria-pressed={registrationType === "delegation"}
              onClick={() => setRegistrationType("delegation")}
            >
              <span className="type-card-icon" aria-hidden="true">
                {MIN_DELEGATION_SIZE}–{MAX_DELEGATION_SIZE}
              </span>
              <span className="type-card-title">Delegation</span>
              <span className="type-card-copy">
                For {MIN_DELEGATION_SIZE} to {MAX_DELEGATION_SIZE} delegates from the same institution. One form and payment.
              </span>
              <span className="type-card-fee">
                {formatPKR(registrationWindow.feePerDelegate)}{" "}
                <small>per delegate</small>
              </span>
            </button>
          </div>
          <button className="button button-primary" type="button" onClick={continueToDetails}>Continue to details <ActionIcon /></button>
        </section> : null}

        {step === 2 ? <section className="form-card" ref={detailsSectionRef}>
          <div className="form-card-heading">
            <div className="section-heading-icon">02</div>
            <div>
              <p className="section-overline">Delegate information</p>
              <h2>{registrationType === "solo" ? "Your details" : "Your delegation"}</h2>
            </div>
          </div>
          {registrationType === "solo" ? (
            <SoloDelegateFields value={solo} onChange={handleSoloChange} />
          ) : (
            <DelegationFields
              value={delegation}
              onFieldChange={handleDelegationFieldChange}
              onSizeChange={handleDelegationSizeChange}
              onHeadIsDelegateChange={handleHeadIsDelegateChange}
              onDelegateChange={handleDelegateChange}
              onRemoveDelegate={handleRemoveDelegate}
            />
          )}
          <div className="field-grid field-grid-single">
            <InputField
              id="registration-ba-code"
              name="baCode"
              label="BA Code"
              value={baCode}
              onChange={(event) => { invalidateReservation(); setBaCode(event.currentTarget.value); }}
              placeholder="Enter your BA Code, if you have one"
              autoComplete="off"
              hint="Optional. Enter the code provided by your Brand Ambassador."
            />
          </div>
          {flowError ? <div className="lookup-error" role="alert"><p>{flowError}</p></div> : null}
          <div className="form-navigation">
            <button className="button button-quiet" type="button" onClick={() => setStep(1)}>Back</button>
            <button className="button button-primary" type="button" onClick={continueToReview}>Review details <ActionIcon /></button>
          </div>
        </section> : null}

        {step === 3 ? <section className="form-card">
          <div className="form-card-heading"><div className="section-heading-icon">03</div><div><p className="section-overline">Review before payment</p><h2>Confirm your fee and details</h2></div></div>
          <FeeSummary registrationType={registrationType} delegateCount={delegateCount} registrationWindow={registrationWindow} total={total} />
          <div className="review-details">
            <h3>Registration details</h3>
            <p><strong>Institution:</strong> {registrationType === "solo" ? solo.institution : delegation.institution}</p>
            {registrationType === "delegation" ? <p><strong>Contact:</strong> {delegation.headName} · {delegation.headEmail}</p> : null}
            <ol>{(registrationType === "solo" ? [solo] : delegation.delegates).map((delegate, index) => <li key={`${delegate.email}-${index}`}><strong>{delegate.fullName}</strong><span>{delegate.email}</span></li>)}</ol>
          </div>
          <p className="payment-rate">Delegation fee: {formatPKR(delegateCount > 1 ? 500 : 0)}. The payable amount and rate are set by the server when your challan is reserved.</p>
          {flowError ? <div className="lookup-error" role="alert"><p>{flowError}</p></div> : null}
          <div className="form-navigation">
            <button className="button button-quiet" type="button" onClick={() => setStep(2)}>Edit details</button>
            <button className="button button-primary" type="button" onClick={generateChallan} disabled={reserving} aria-busy={reserving}>{reserving ? "Reserving…" : "Generate challan"} <ActionIcon /></button>
          </div>
        </section> : null}

        <div className="registration-mobile-summary">
          <FeeSummary
            registrationType={registrationType}
            delegateCount={delegateCount}
            registrationWindow={registrationWindow}
            total={total}
          />
        </div>

        {step === 4 ? <PaymentSection
          delegateCount={delegateCount}
          feePerDelegate={registrationWindow.feePerDelegate}
          rateLabel={registrationWindow.name}
          receiptName={receipt?.name ?? ""}
          onReceiptChange={setReceipt}
          reservation={reservation}
          onRegenerate={generateChallan}
          onEditDetails={() => { invalidateReservation(); setStep(2); setSubmitError(null); }}
        /> : null}

        {step === 4 ? <section className="submit-card">
          <label className="checkbox-row terms-row">
            <input type="checkbox" required />
            <span>
              <strong>I confirm that the information provided is accurate.</strong>
              <small>
                All registrations are final and payments are non-refundable. Please
                verify your details before submitting.
              </small>
            </span>
          </label>
          {submitError ? (
            <div className="lookup-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{submitError}</p>
            </div>
          ) : null}
            <button
            className="button button-primary submit-button"
            type="submit"
            disabled={submitting || !reservation || (currentTime > 0 && currentTime >= new Date(reservation.graceUntil).getTime())}
            aria-busy={submitting}
          >
            {submitting ? "Submitting…" : currentTime >= new Date(reservation?.graceUntil ?? 0).getTime() ? "Challan expired" : "Submit Registration"}{" "}
            <ActionIcon />
          </button>
          <p className="submit-footnote">
            By submitting this form, you confirm that the information provided is accurate.
            All payments are final and non-refundable. Your payment will be reviewed, and
            your status will be updated in the portal.
          </p>
        </section> : null}
      </form>

      <aside className="registration-sidebar">
        <div className="registration-desktop-summary">
          <FeeSummary
            registrationType={registrationType}
            delegateCount={delegateCount}
            registrationWindow={registrationWindow}
            total={total}
          />
        </div>

        <section className="sidebar-card event-aside">
          <p className="section-overline">Conference details</p>
          <h2>Three days. One shared floor.</h2>
          <ul className="event-facts">
            <li>
              <span className="fact-mark">◷</span>
              <span>
                <strong>{EVENT_DETAILS.dates}</strong>
                <small>{EVENT_DETAILS.dailyHours}</small>
              </span>
            </li>
            <li>
              <span className="fact-mark">⌖</span>
              <span>
                <strong>FAST-NUCES Karachi</strong>
                <small>Main Campus, National Highway</small>
              </span>
            </li>
            <li>
              <span className="fact-mark">✧</span>
              <span>
                <strong>No MUN experience needed</strong>
                <small>Study guides and chair support are provided.</small>
              </span>
            </li>
          </ul>
        </section>

        <section className="sidebar-note">
          <span className="note-star" aria-hidden="true">
            ✦
          </span>
          <div>
            <strong>Need a hand?</strong>
            <p>Questions about registration? The TLC team is happy to help.</p>
            <a href="mailto:tlc.khi@nu.edu.pk">Contact the organisers</a>
          </div>
        </section>
      </aside>
    </div>
  );
}
