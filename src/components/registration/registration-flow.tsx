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
  COMMITTEES,
  CURRENT_REGISTRATION_WINDOW,
  DELEGATION_FEE,
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
  submitRegistration,
  type ChallanReservation,
  type RegistrationSuccess,
} from "@/lib/api/registration";
import { quickPayPaymentId } from "@/lib/paymentDetails";

const STEPS = ["Type", "Details", "Review", "Payment"] as const;
const DRAFT_STORAGE_KEY = "tgd26-registration-draft";

/** Saved for this browser tab only, so a refresh resumes the form and its reserved challan. */
interface StoredDraft {
  version: 1;
  step: number;
  registrationType: RegistrationType;
  solo: SoloFormValues;
  delegation: DelegationFormValues;
  baCode: string;
  draftId: string | null;
  reservation: ChallanReservation | null;
  reservedKey: string | null;
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function readStoredDraft(): StoredDraft | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? "null") as StoredDraft | null;
    return stored?.version === 1 ? stored : null;
  } catch {
    return null;
  }
}

function clearStoredDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); nothing was saved then.
  }
}

/** True while the challan can still be submitted (within its 30-minute reservation). */
function isReservationLive(reservation: ChallanReservation | null, at = Date.now()) {
  return reservation !== null && at < Date.parse(reservation.expiresAt);
}

/** Ticks once a second while active; returns 0 until the first tick. */
function useNow(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [active]);
  return now;
}

function committeeLabel(code: string) {
  const committee = COMMITTEES.find((item) => item.code === code);
  return committee ? `${committee.code} · ${committee.name}` : code || "Not chosen";
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
      {delegateCount > 1 ? <div className="summary-line"><span>Delegation fee</span><strong>{formatPKR(DELEGATION_FEE)}</strong></div> : null}
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

function ReviewDetails({
  registrationType,
  solo,
  delegation,
  baCode,
  onEdit,
}: {
  registrationType: RegistrationType;
  solo: SoloFormValues;
  delegation: DelegationFormValues;
  baCode: string;
  onEdit: () => void;
}) {
  const delegates = registrationType === "solo" ? [solo] : delegation.delegates;
  return (
    <div className="review-details">
      <section className="review-group">
        <div className="review-group-heading">
          <h3>Registration</h3>
          <button className="review-edit" type="button" onClick={onEdit}>Edit</button>
        </div>
        <dl className="review-list">
          <div><dt>Type</dt><dd>{registrationType === "solo" ? "Solo delegate" : `Delegation of ${delegation.size}`}</dd></div>
          <div><dt>Institution</dt><dd>{registrationType === "solo" ? solo.institution : delegation.institution}</dd></div>
          <div><dt>BA Code</dt><dd>{baCode.trim() || "None"}</dd></div>
        </dl>
      </section>

      {registrationType === "delegation" ? (
        <section className="review-group">
          <div className="review-group-heading">
            <h3>Head delegate</h3>
            <button className="review-edit" type="button" onClick={onEdit}>Edit</button>
          </div>
          <dl className="review-list">
            <div><dt>Name</dt><dd>{delegation.headName}</dd></div>
            <div><dt>Email</dt><dd>{delegation.headEmail}</dd></div>
            <div><dt>WhatsApp</dt><dd>{delegation.headWhatsapp}</dd></div>
            <div><dt>Also a delegate</dt><dd>{delegation.headIsDelegate ? "Yes, as Delegate 1" : "No"}</dd></div>
          </dl>
        </section>
      ) : null}

      {delegates.map((delegate, index) => (
        <section className="review-group" key={index}>
          <div className="review-group-heading">
            <h3>{registrationType === "solo" ? "Your details" : `Delegate ${index + 1}`}</h3>
            <button className="review-edit" type="button" onClick={onEdit}>Edit</button>
          </div>
          <dl className="review-list">
            <div><dt>Name</dt><dd>{delegate.fullName}</dd></div>
            <div><dt>Email</dt><dd>{delegate.email}</dd></div>
            <div><dt>WhatsApp</dt><dd>{delegate.whatsapp}</dd></div>
            <div><dt>Experience</dt><dd>{delegate.experience}</dd></div>
            <div><dt>First preference</dt><dd>{committeeLabel(delegate.firstPreference)}</dd></div>
            <div><dt>Second preference</dt><dd>{committeeLabel(delegate.secondPreference)}</dd></div>
            {registrationType === "solo" && solo.additionalInformation.trim() ? (
              <div className="review-list-wide"><dt>Additional information</dt><dd>{solo.additionalInformation}</dd></div>
            ) : null}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function RegistrationFlow() {
  const [step, setStep] = useState(1);
  const [registrationType, setRegistrationType] = useState<RegistrationType>("solo");
  const [registrationWindow, setRegistrationWindow] =
    useState<RegistrationWindow>(CURRENT_REGISTRATION_WINDOW);
  const [solo, setSolo] = useState<SoloFormValues>(emptySoloForm);
  const [delegation, setDelegation] = useState<DelegationFormValues>(emptyDelegation);
  const [baCode, setBaCode] = useState("");
  const [website, setWebsite] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [confirmation, setConfirmation] = useState<RegistrationSuccess | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [challanInvalid, setChallanInvalid] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ChallanReservation | null>(null);
  /** The details the reservation was made for; any difference needs a new challan. */
  const [reservedKey, setReservedKey] = useState<string | null>(null);
  const [reserving, setReserving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /** When the current step was entered; render code compares times against this, not Date.now(). */
  const [stepEnteredAt, setStepEnteredAt] = useState(0);
  const detailsSectionRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  // One key per form fill: links every challan generated for it and makes submit retries safe.
  const draftId = useRef<string | null>(null);

  const now = useNow(step === 4 && reservation !== null);
  const delegateCount = registrationType === "solo" ? 1 : delegation.size;
  const detailsKey = JSON.stringify(buildRegistrationDetails({ type: registrationType, solo, delegation, baCode }));
  const total = delegateCount * registrationWindow.feePerDelegate + (delegateCount > 1 ? DELEGATION_FEE : 0);
  const reservationMatches = reservation !== null && reservedKey === detailsKey;
  const checkedAt = now || stepEnteredAt;
  const reservationLive = reservation !== null && checkedAt > 0 && checkedAt < Date.parse(reservation.expiresAt);
  const expired = reservation !== null && now > 0 && !reservationLive;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRegistrationWindow(getCurrentRegistrationWindow());
      const stored = readStoredDraft();
      if (stored) {
        const live = isReservationLive(stored.reservation);
        setRegistrationType(stored.registrationType);
        setSolo(stored.solo);
        setDelegation(stored.delegation);
        setBaCode(stored.baCode);
        draftId.current = stored.draftId;
        setReservation(live ? stored.reservation : null);
        setReservedKey(live ? stored.reservedKey : null);
        const restoredStep = stored.step === 4 && !live ? 3 : stored.step;
        previousStep.current = restoredStep;
        setStep(restoredStep);
      }
      setStepEnteredAt(Date.now());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated || confirmation) return;
    const draft: StoredDraft = {
      version: 1,
      step,
      registrationType,
      solo,
      delegation,
      baCode,
      draftId: draftId.current,
      reservation,
      reservedKey,
    };
    try {
      window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or unavailable: the form still works, it just won't survive a refresh.
    }
  }, [hydrated, confirmation, step, registrationType, solo, delegation, baCode, reservation, reservedKey]);

  // Moving between steps brings the new step into view and moves focus to its heading.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function goToStep(next: number) {
    setStep(next);
    setStepEnteredAt(Date.now());
    setFlowError(null);
    setSubmitError(null);
    setChallanInvalid(false);
  }

  function handleSoloChange(field: keyof SoloFormValues, value: string) {
    setSolo((current) => ({ ...current, [field]: value }));
  }

  function handleDelegationFieldChange(
    field: "institution" | "headName" | "headEmail" | "headWhatsapp",
    value: string,
  ) {
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
    setDelegation((current) => {
      const delegates = [...current.delegates];
      delegates[index] = { ...delegates[index], [field]: value };
      return { ...current, delegates };
    });
  }

  function handleRemoveDelegate(index: number) {
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

  function continueToReview() {
    const fields = detailsSectionRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea") ?? [];
    const firstInvalid = [...fields].find((field) => !field.checkValidity());
    if (firstInvalid) {
      firstInvalid.reportValidity();
      firstInvalid.focus();
      return;
    }
    goToStep(3);
  }

  /**
   * Reuses the current challan when nothing changed; otherwise reserves one, replacing the old.
   * `force` always asks the server, which returns the same challan if it is still held for these details.
   */
  async function continueToPayment(force = false) {
    if (reserving) return;
    if (!force && reservationMatches && isReservationLive(reservation)) {
      goToStep(4);
      return;
    }
    setReserving(true);
    setFlowError(null);
    setSubmitError(null);
    setChallanInvalid(false);
    draftId.current ??= newIdempotencyKey();
    const result = await reserveChallan({
      registration: buildRegistrationDetails({ type: registrationType, solo, delegation, baCode }),
      draftId: draftId.current,
      ...(reservation && isReservationLive(reservation) ? { previousReservationToken: reservation.reservationToken } : {}),
      website,
    });
    setReserving(false);
    if (!result.ok) {
      setFlowError(result.field ? describeField(result.field, registrationType) + ": " + result.error : result.error);
      return;
    }
    if (result.data.challanNumber !== reservation?.challanNumber) setReceipt(null);
    setReservation(result.data);
    setReservedKey(detailsKey);
    goToStep(4);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 4 || !reservation || submitting) return;
    if (!event.currentTarget.reportValidity()) return;
    if (!receipt) {
      setSubmitError("Please upload a screenshot of your payment before submitting.");
      return;
    }

    draftId.current ??= newIdempotencyKey();
    setSubmitting(true);
    setSubmitError(null);
    setChallanInvalid(false);
    const result = await submitRegistration({
      type: registrationType,
      solo,
      delegation,
      receipt,
      transactionId,
      baCode,
      idempotencyKey: draftId.current,
      reservationToken: reservation.reservationToken,
      website,
    });
    setSubmitting(false);

    if (result.ok) {
      clearStoredDraft();
      setConfirmation(result.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setChallanInvalid(result.code === "CHALLAN_INVALID");
      setSubmitError(
        result.field
          ? describeField(result.field, registrationType) + ": " + result.error
          : result.error,
      );
    }
  }

  function startNewRegistration() {
    clearStoredDraft();
    setStep(1);
    setConfirmation(null);
    setSolo(emptySoloForm());
    setDelegation(emptyDelegation());
    setBaCode("");
    setReceipt(null);
    setTransactionId("");
    setReservation(null);
    setReservedKey(null);
    setFlowError(null);
    setSubmitError(null);
    setChallanInvalid(false);
    draftId.current = null;
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
          Your registration has been received with {confirmation.test ? `test challan ${confirmation.challanNumber} (not payable)` : `QuickPay ID ${quickPayPaymentId(confirmation.challanNumber)}`}. Your payment will now be reviewed. Once it
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

  const staleChallan = reservation !== null && !reservationMatches && reservationLive;

  return (
    <div className="registration-layout">
      <form className="registration-form" onSubmit={handleSubmit} ref={formRef}>
        <ol className="registration-steps" aria-label="Registration progress">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const state = step === number ? "is-current" : step > number ? "is-complete" : "";
            return (
              <li key={label} className={state} aria-current={step === number ? "step" : undefined}>
                <span className="step-number" aria-hidden="true">{step > number ? "✓" : number}</span>
                <span className="step-label">
                  <span className="visually-hidden">Step {number}: </span>
                  {label}
                  {step > number ? <span className="visually-hidden"> (completed)</span> : null}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Hidden from people; bots that fill every field reveal themselves here. */}
        <div className="form-honeypot" aria-hidden="true">
          <label htmlFor="registration-website">Website</label>
          <input
            id="registration-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.currentTarget.value)}
          />
        </div>

        {step === 1 ? <section className="form-card">
          <div className="form-card-heading">
            <div className="section-heading-icon">01</div>
            <div>
              <p className="section-overline">Start here</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Choose your registration</h2>
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
                <small>per delegate + {formatPKR(DELEGATION_FEE)} delegation fee</small>
              </span>
            </button>
          </div>
          <div className="form-navigation form-navigation-end">
            <button className="button button-primary" type="button" onClick={() => goToStep(2)}>Continue to details <ActionIcon /></button>
          </div>
        </section> : null}

        {step === 2 ? <section className="form-card" ref={detailsSectionRef}>
          <div className="form-card-heading">
            <div className="section-heading-icon">02</div>
            <div>
              <p className="section-overline">Delegate information</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>{registrationType === "solo" ? "Your details" : "Your delegation"}</h2>
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
              maxLength={50}
              onChange={(event) => setBaCode(event.currentTarget.value)}
              placeholder="Enter your BA Code, if you have one"
              autoComplete="off"
              hint="Optional. Enter the code provided by your Brand Ambassador."
            />
          </div>
          <div className="form-navigation">
            <button className="button button-quiet" type="button" onClick={() => goToStep(1)}>Back</button>
            <button className="button button-primary" type="button" onClick={continueToReview}>Review details <ActionIcon /></button>
          </div>
        </section> : null}

        {step === 3 ? <section className="form-card">
          <div className="form-card-heading">
            <div className="section-heading-icon">03</div>
            <div>
              <p className="section-overline">Review before payment</p>
              <h2 ref={stepHeadingRef} tabIndex={-1}>Check your details</h2>
            </div>
          </div>
          <p className="review-intro">
            Your challan is generated for exactly these details. If anything changes after you
            pay, you will need a new challan, so please check carefully.
          </p>
          <ReviewDetails
            registrationType={registrationType}
            solo={solo}
            delegation={delegation}
            baCode={baCode}
            onEdit={() => goToStep(2)}
          />
          {staleChallan ? (
            <div className="review-notice" role="note">
              <strong>Your details changed after challan {reservation?.challanNumber} was generated.</strong>
              <span>Do not pay that challan. A new challan will replace it when you continue.</span>
            </div>
          ) : null}
          {flowError ? <div className="lookup-error" role="alert"><span aria-hidden="true">!</span><p>{flowError}</p></div> : null}
          <div className="form-navigation">
            <button className="button button-quiet" type="button" onClick={() => goToStep(2)}>Edit details</button>
            <button className="button button-primary" type="button" onClick={() => void continueToPayment()} disabled={reserving} aria-busy={reserving}>
              {reserving
                ? "Reserving challan…"
                : reservationMatches && reservationLive
                  ? "Continue to payment"
                  : staleChallan
                    ? "Generate new challan"
                    : "Generate challan"}{" "}
              <ActionIcon />
            </button>
          </div>
        </section> : null}

        <div className="registration-mobile-summary">
          <FeeSummary
            registrationType={registrationType}
            delegateCount={delegateCount}
            registrationWindow={registrationWindow}
            total={reservationMatches && reservation ? reservation.amount : total}
          />
        </div>

        {step === 4 ? <PaymentSection
          delegateCount={delegateCount}
          reservation={reservation}
          now={now}
          receiptName={receipt?.name ?? ""}
          onReceiptChange={setReceipt}
          transactionId={transactionId}
          onTransactionIdChange={setTransactionId}
          onRegenerate={() => void continueToPayment(true)}
          regenerating={reserving}
          onEditDetails={() => goToStep(3)}
          headingRef={stepHeadingRef}
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
          {flowError ? <div className="lookup-error" role="alert"><span aria-hidden="true">!</span><p>{flowError}</p></div> : null}
          {submitError ? (
            <div className="lookup-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{submitError}</p>
              {challanInvalid ? (
                <button className="button button-quiet" type="button" onClick={() => void continueToPayment(true)} disabled={reserving}>
                  {reserving ? "Generating…" : "Generate new challan"}
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            className="button button-primary submit-button"
            type="submit"
            disabled={submitting || !reservation || expired}
            aria-busy={submitting}
          >
            {submitting ? "Submitting…" : expired ? "Challan expired" : "Submit registration"}{" "}
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
            total={reservationMatches && reservation ? reservation.amount : total}
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
