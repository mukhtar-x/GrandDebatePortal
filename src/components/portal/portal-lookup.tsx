"use client";

import { useState, type FormEvent } from "react";
import { InputField } from "@/components/ui/form-fields";
import {
  lookupApplication,
  resubmitReceipt,
  type ApplicationStatus,
  type DelegateRow,
  type PortalApplication,
} from "@/lib/api/portal";

const statusSteps = [
  {
    key: "submitted",
    title: "Submitted",
    description: "Your registration has been received. Thank you.",
  },
  {
    key: "payment-review",
    title: "Payment under review",
    description:
      "Your payment is being reviewed. Once confirmed, your committee will be allocated within 1 to 3 business days.",
  },
  {
    key: "payment-confirmed",
    title: "Payment confirmed",
    description:
      "You are confirmed as a delegate. Your committee will be allocated within 1 to 3 business days.",
  },
  {
    key: "allocated",
    title: "Committee allocated",
    description: "Your committee and portfolio are ready.",
  },
] as const;

const statusIndex: Partial<Record<ApplicationStatus, number>> = {
  submitted: 0,
  "payment-review": 1,
  "payment-confirmed": 2,
  allocated: 3,
};

const statusLabels: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  "payment-review": "Payment under review",
  "payment-confirmed": "Payment confirmed",
  allocated: "Committee allocated",
  "action-required": "Action required",
  waitlisted: "Waitlisted",
};

function statusClass(status: string) {
  if (status.toLowerCase().includes("allocated")) return "status-pill status-pill-success";
  if (status.toLowerCase().includes("review")) return "status-pill status-pill-review";
  if (status.toLowerCase().includes("submitted")) return "status-pill status-pill-neutral";
  return "status-pill status-pill-pending";
}

interface SignedIn {
  email: string;
  application: PortalApplication;
}

export function PortalLookup() {
  const [email, setEmail] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [signedIn, setSignedIn] = useState<SignedIn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await lookupApplication(email.trim(), applicationId.trim());
    setLoading(false);
    if (result.ok) {
      setSignedIn({ email: email.trim(), application: result.application });
    } else {
      setSignedIn(null);
      setError(result.error);
    }
  }

  function clearResult() {
    setSignedIn(null);
    setError(null);
  }

  return (
    <div className="portal-lookup-layout">
      <section className="portal-lookup-card">
        <div className="form-card-heading">
          <div className="section-heading-icon">01</div>
          <div>
            <p className="section-overline">Application lookup</p>
            <h2>Track your application</h2>
          </div>
        </div>
        <form className="lookup-form" onSubmit={handleLookup}>
          <InputField
            id="lookup-email"
            name="email"
            type="email"
            label="Email"
            placeholder="The address used for registration"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              clearResult();
            }}
            required
          />
          <InputField
            id="lookup-application-id"
            name="applicationId"
            label="Application ID"
            placeholder="For example, TGD-2026-1A2B3C4D5E6F7A8B"
            autoComplete="off"
            value={applicationId}
            onChange={(event) => {
              setApplicationId(event.currentTarget.value);
              clearResult();
            }}
            required
          />
          {error ? (
            <div className="lookup-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{error}</p>
            </div>
          ) : null}
          <button
            className="button button-primary lookup-button"
            type="submit"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Checking…" : "Check Status"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="lookup-help">
          If you cannot locate your application ID, please refer to your confirmation
          screen. For further assistance, contact us on WhatsApp at 0314 3552058 or by email
          at <a href="mailto:tlc.khi@nu.edu.pk">tlc.khi@nu.edu.pk</a>.
        </p>
      </section>

      {signedIn ? (
        <ApplicationStatusView
          key={signedIn.application.applicationId}
          email={signedIn.email}
          application={signedIn.application}
          onUpdate={(application) => setSignedIn({ ...signedIn, application })}
        />
      ) : !error ? (
        <div className="portal-empty-state">
          <span className="empty-state-mark" aria-hidden="true">
            ✦
          </span>
          <p className="section-overline">Your progress, in one place</p>
          <h2>Enter your details to get started.</h2>
          <p>
            Enter the email address used for registration and your application ID to view
            the status of your application.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ApplicationStatusView({
  email,
  application,
  onUpdate,
}: {
  email: string;
  application: PortalApplication;
  onUpdate: (application: PortalApplication) => void;
}) {
  const currentStep = statusIndex[application.status];
  const isSpecial =
    application.status === "action-required" || application.status === "waitlisted";

  return (
    <section className="application-status-panel" aria-live="polite">
      <div className="application-header">
        <div>
          <p className="section-overline">Application status</p>
          <h2>Welcome, {application.firstName}.</h2>
        </div>
        <span className={statusClass(statusLabels[application.status])}>
          {statusLabels[application.status]}
        </span>
      </div>
      <div className="application-meta">
        <span>
          <small>Application ID</small>
          <strong>{application.applicationId}</strong>
        </span>
        <span>
          <small>Registration type</small>
          <strong>{application.type === "solo" ? "Solo delegate" : "Delegation"}</strong>
        </span>
      </div>

      {isSpecial ? (
        <SpecialStatus email={email} application={application} onUpdate={onUpdate} />
      ) : (
        <>
          <div className="status-tracker" aria-label="Application progress">
            {statusSteps.map((step, index) => {
              const isCurrent = index === currentStep;
              const isComplete = currentStep !== undefined && index < currentStep;
              return (
                <div
                  className={
                    "tracker-step" +
                    (isComplete ? " is-complete" : "") +
                    (isCurrent ? " is-current" : "")
                  }
                  key={step.key}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <div className="tracker-step-marker">
                    {isComplete ? "✓" : String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="tracker-step-copy">
                    <strong>{step.title}</strong>
                    <p>{isCurrent ? application.message : step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {application.status === "allocated" ? (
            <div className="allocation-card">
              <span className="allocation-mark" aria-hidden="true">
                ✦
              </span>
              <div>
                <p className="section-overline">Your assignment</p>
                <h3>
                  {application.committeeName ?? application.committee ?? "Your committee is ready"}
                </h3>
                {application.portfolio ? (
                  <p>Representing {application.portfolio}</p>
                ) : null}
              </div>
              {application.studyGuideUrl ? (
                <a
                  className="button button-secondary"
                  href={application.studyGuideUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Study Guide
                </a>
              ) : (
                <button className="button button-secondary" type="button" disabled>
                  Study guide coming soon
                </button>
              )}
            </div>
          ) : null}
        </>
      )}

      {application.type === "delegation" && application.delegates?.length ? (
        <DelegationStatusTable
          delegates={application.delegates}
          isHeadView={application.isHeadView}
        />
      ) : null}
    </section>
  );
}

function SpecialStatus({
  email,
  application,
  onUpdate,
}: {
  email: string;
  application: PortalApplication;
  onUpdate: (application: PortalApplication) => void;
}) {
  const [receipt, setReceipt] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (application.status === "waitlisted") {
    return (
      <div className="special-status-card waitlist-card">
        <span className="special-status-icon" aria-hidden="true">
          ◷
        </span>
        <div>
          <p className="section-overline">Waitlisted</p>
          <h3>Your preferred committee is currently full.</h3>
          <p>
            You have been placed on the waitlist. This page will be updated as soon as a
            seat becomes available. No further action is required.
          </p>
        </div>
      </div>
    );
  }

  async function handleUpload() {
    if (!receipt || uploading) return;
    setUploading(true);
    setUploadError(null);
    const result = await resubmitReceipt(email, application.applicationId, receipt);
    setUploading(false);
    if (result.ok) onUpdate(result.application);
    else setUploadError(result.error);
  }

  return (
    <div className="special-status-card action-card">
      <span className="special-status-icon" aria-hidden="true">
        !
      </span>
      <div>
        <p className="section-overline">Action required</p>
        <h3>We were unable to verify your payment.</h3>
        <p>{application.message}</p>
        {application.canResubmitReceipt ? (
          <>
            <label className="field action-upload">
              <span className="field-label">Upload a new screenshot</span>
              <input
                className="form-control file-control"
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={(event) => {
                  setReceipt(event.currentTarget.files?.[0] ?? null);
                  setUploadError(null);
                }}
              />
              <span className="field-hint">
                Image or PDF. The amount and date must be clearly legible.
              </span>
            </label>
            {receipt ? (
              <span className="selected-file" role="status">
                Selected: {receipt.name}
              </span>
            ) : null}
            {uploadError ? (
              <div className="lookup-error" role="alert">
                <span aria-hidden="true">!</span>
                <p>{uploadError}</p>
              </div>
            ) : null}
            <button
              className="button button-primary"
              type="button"
              disabled={!receipt || uploading}
              aria-busy={uploading}
              onClick={handleUpload}
            >
              {uploading ? "Uploading…" : "Upload New Screenshot"}
            </button>
          </>
        ) : (
          <p className="field-hint">
            Your head delegate has been asked to upload a new payment screenshot.
          </p>
        )}
      </div>
    </div>
  );
}

function DelegationStatusTable({
  delegates,
  isHeadView,
}: {
  delegates: DelegateRow[];
  isHeadView: boolean;
}) {
  return (
    <div className="delegation-status">
      <div className="delegation-status-heading">
        <div>
          <p className="section-overline">Delegation</p>
          <h3>{isHeadView ? "Delegate progress" : "Your progress"}</h3>
        </div>
        <span>
          {delegates.length} {delegates.length === 1 ? "delegate" : "delegates"}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Delegate</th>
              <th scope="col">Committee</th>
              <th scope="col">Portfolio</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {delegates.map((delegate, index) => (
              <tr key={delegate.name + index}>
                <th scope="row">
                  {delegate.name}
                  {delegate.isHead ? " (Head)" : ""}
                </th>
                <td>{delegate.committee ?? "Pending"}</td>
                <td>{delegate.portfolio ?? "Pending"}</td>
                <td>
                  <span className={statusClass(delegate.status)}>{delegate.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isHeadView ? (
        <p className="table-note">
          The head delegate can view each delegate&apos;s individual committee, portfolio
          and status.
        </p>
      ) : null}
    </div>
  );
}
