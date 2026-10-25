"use client";

import Link from "next/link";
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
  formatPKR,
  getCurrentRegistrationWindow,
  type RegistrationWindow,
} from "@/data/event";
import {
  describeField,
  submitRegistration,
  type RegistrationSuccess,
} from "@/lib/api/registration";

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function RegistrationFlow() {
  const [registrationType, setRegistrationType] = useState<RegistrationType>("solo");
  const [registrationWindow, setRegistrationWindow] =
    useState<RegistrationWindow>(CURRENT_REGISTRATION_WINDOW);
  const [solo, setSolo] = useState<SoloFormValues>(emptySoloForm);
  const [delegation, setDelegation] = useState<DelegationFormValues>(emptyDelegation);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState<RegistrationSuccess | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One key per form fill (created on first submit), so a retry cannot create two registrations.
  const idempotencyKey = useRef<string | null>(null);

  const delegateCount = registrationType === "solo" ? 1 : delegation.size;
  const total = delegateCount * registrationWindow.feePerDelegate;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRegistrationWindow(getCurrentRegistrationWindow());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

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
      const delegates = current.delegates.slice(0, size);
      while (delegates.length < size) delegates.push(emptyDelegate());
      return { ...current, size, delegates };
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      idempotencyKey: idempotencyKey.current,
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
    setConfirmation(null);
    setSolo(emptySoloForm());
    setDelegation(emptyDelegation());
    setReceipt(null);
    idempotencyKey.current = null;
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
          Your registration has been received. Your payment will now be reviewed. Once it
          is confirmed, your committee will be allocated within 1 to 3 business days. You
          may monitor your progress in the portal at any time.
        </p>
        <p className="confirmation-copy">
          We'll send an update to the email address on your registration. If it doesn't
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
            Go to Portal <span aria-hidden="true">→</span>
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
          Go to Portal <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  }

  return (
    <div className="registration-layout">
      <form className="registration-form" onSubmit={handleSubmit}>
        <div className="registration-state-banner" role="status">
          <span className="eyebrow-dot" />
          <span>{registrationWindow.description}</span>
        </div>

        <section className="form-card">
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
                04–07
              </span>
              <span className="type-card-title">Delegation</span>
              <span className="type-card-copy">
                For 4 to 7 delegates from the same institution. One form and payment.
              </span>
              <span className="type-card-fee">
                {formatPKR(registrationWindow.feePerDelegate)}{" "}
                <small>per delegate</small>
              </span>
            </button>
          </div>
        </section>

        <section className="form-card">
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
            />
          )}
        </section>

        <PaymentSection
          delegateCount={delegateCount}
          feePerDelegate={registrationWindow.feePerDelegate}
          rateLabel={registrationWindow.name}
          receiptName={receipt?.name ?? ""}
          onReceiptChange={setReceipt}
        />

        <section className="submit-card">
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
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? "Submitting…" : "Submit Registration"}{" "}
            <span aria-hidden="true">→</span>
          </button>
          <p className="submit-footnote">
            By submitting this form, you confirm that the information provided is accurate.
            All payments are final and non-refundable. Your payment will be reviewed, and
            your status will be updated in the portal.
          </p>
        </section>
      </form>

      <aside className="registration-sidebar">
        <section className="summary-card">
          <div className="summary-card-top">
            <span className="summary-icon" aria-hidden="true">
              ✦
            </span>
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
          <div className="summary-total">
            <span>Total payable</span>
            <strong>{formatPKR(total)}</strong>
          </div>
          <p className="summary-deadline">
            Rate available until {registrationWindow.deadline}.
          </p>
        </section>

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
