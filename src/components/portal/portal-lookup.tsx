"use client";

import { useState, type FormEvent } from "react";
import { InputField } from "@/components/ui/form-fields";
import {
  DEMO_APPLICATIONS,
  findMockApplication,
  type ApplicationStatus,
  type PortalApplication,
} from "@/data/portal-mocks";

const demoCases = [
  {
    application: DEMO_APPLICATIONS[0],
    title: "Payment under review",
    note: "Solo delegate",
  },
  {
    application: DEMO_APPLICATIONS[1],
    title: "Committee allocated",
    note: "Delegation",
  },
  {
    application: DEMO_APPLICATIONS[5],
    title: "Payment confirmed",
    note: "Committee allocation in progress",
  },
  {
    application: DEMO_APPLICATIONS[2],
    title: "Action required",
    note: "Upload a clearer receipt",
  },
  {
    application: DEMO_APPLICATIONS[3],
    title: "Waitlisted",
    note: "No further action needed",
  },
] as const;

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

export function PortalLookup() {
  const [email, setEmail] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [application, setApplication] = useState<PortalApplication | null>(null);
  const [error, setError] = useState(false);

  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const match = findMockApplication(email, applicationId);
    setApplication(match);
    setError(!match);
  }

  function loadDemo(record: PortalApplication) {
    setEmail(record.email);
    setApplicationId(record.applicationId);
    setApplication(record);
    setError(false);
  }

  return (
    <div className="portal-lookup-layout">
      <section className="portal-lookup-card">
        <div className="form-card-heading">
          <div className="section-heading-icon">01</div>
          <div>
            <p className="section-overline">Application lookup</p>
            <h2>Sign in to your portal</h2>
          </div>
        </div>
        <form className="lookup-form" onSubmit={handleLookup}>
          <InputField
            id="lookup-email"
            name="email"
            type="email"
            label="Email address"
            placeholder="The address used for registration"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              setApplication(null);
              setError(false);
            }}
            required
          />
          <InputField
            id="lookup-application-id"
            name="applicationId"
            label="Application ID"
            placeholder="For example, TGD26-12345"
            autoComplete="off"
            value={applicationId}
            onChange={(event) => {
              setApplicationId(event.currentTarget.value);
              setApplication(null);
              setError(false);
            }}
            required
          />
          {error ? (
            <div className="lookup-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>
                No application was found with those details. Check your email and
                application ID, then try again.
              </p>
            </div>
          ) : null}
          <button className="button button-primary lookup-button" type="submit">
            Check status <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="lookup-help">
          If you cannot locate your application ID, check your confirmation screen or
          contact the organisers at{" "}
          <a href="mailto:tlc.khi@nu.edu.pk">tlc.khi@nu.edu.pk</a>.
        </p>
      </section>

      <aside className="portal-aside">
        <section className="sidebar-card portal-aside-card">
          <p className="section-overline">What happens next</p>
          <h2>One clear step at a time.</h2>
          <p>
            We review each payment, then allocate delegates to a committee within 1 to 3
            business days of confirmation.
          </p>
          <div className="mini-timeline">
            <span className="mini-timeline-line" />
            <span className="mini-timeline-step is-complete">1</span>
            <span className="mini-timeline-step">2</span>
            <span className="mini-timeline-step">3</span>
            <span className="mini-timeline-step">4</span>
          </div>
          <div className="mini-timeline-labels">
            <span>Submitted</span>
            <span>Committee</span>
          </div>
        </section>

        <section className="demo-samples">
          <div className="demo-samples-heading">
            <span className="demo-label">Preview</span>
            <h2>Explore sample statuses</h2>
            <p>Load a fictional record to preview the portal states.</p>
          </div>
          <div className="demo-case-list">
            {demoCases.map(({ application: record, title, note }) => (
              <button
                className="demo-case-button"
                type="button"
                key={record.applicationId}
                onClick={() => loadDemo(record)}
              >
                <span className="demo-case-mark" aria-hidden="true">
                  ↗
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{note}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      {application ? (
        <ApplicationStatusView application={application} />
      ) : !error ? (
        <div className="portal-empty-state">
          <span className="empty-state-mark" aria-hidden="true">
            ✦
          </span>
          <p className="section-overline">Your progress, in one place</p>
          <h2>Enter your details to get started.</h2>
          <p>
            Your committee assignment and delegate information will appear here as soon
            as the organisers update your application.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ApplicationStatusView({
  application,
}: {
  application: PortalApplication;
}) {
  const [receiptName, setReceiptName] = useState("");
  const [receiptSelected, setReceiptSelected] = useState(false);
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
        <SpecialStatus
          application={application}
          receiptName={receiptName}
          receiptSelected={receiptSelected}
          onReceiptChange={(file) => {
            setReceiptName(file?.name ?? "");
            setReceiptSelected(false);
          }}
          onReceiptSubmit={() => setReceiptSelected(true)}
        />
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
                    <p>{step.description}</p>
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
                <h3>{application.committee ?? "Your committee is ready"}</h3>
                {application.portfolio ? (
                  <p>Representing {application.portfolio}</p>
                ) : null}
              </div>
              <button className="button button-secondary" type="button" disabled>
                Study guide coming soon
              </button>
            </div>
          ) : null}
        </>
      )}

      {application.type === "delegation" && application.delegates?.length ? (
        <DelegationStatusTable delegates={application.delegates} />
      ) : null}
      <p className="mock-disclaimer">
        Preview record · Status and delegate information shown here is mock data.
      </p>
    </section>
  );
}

function SpecialStatus({
  application,
  receiptName,
  receiptSelected,
  onReceiptChange,
  onReceiptSubmit,
}: {
  application: PortalApplication;
  receiptName: string;
  receiptSelected: boolean;
  onReceiptChange: (file: File | null) => void;
  onReceiptSubmit: () => void;
}) {
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

  return (
    <div className="special-status-card action-card">
      <span className="special-status-icon" aria-hidden="true">
        !
      </span>
      <div>
        <p className="section-overline">Action required</p>
        <h3>We need a clearer payment screenshot.</h3>
        <p>
          {application.actionReason ??
            "We were unable to verify your payment. Please choose a new screenshot for review."}
        </p>
        <label className="field action-upload">
          <span className="field-label">Upload a new screenshot</span>
          <input
            className="form-control file-control"
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={(event) => onReceiptChange(event.currentTarget.files?.[0] ?? null)}
          />
          <span className="field-hint">Image or PDF. Make sure the amount is legible.</span>
        </label>
        {receiptName ? (
          <span className="selected-file" role="status">
            Selected: {receiptName}
          </span>
        ) : null}
        <button
          className="button button-primary"
          type="button"
          disabled={!receiptName || receiptSelected}
          onClick={onReceiptSubmit}
        >
          {receiptSelected ? "Screenshot received (demo)" : "Submit new screenshot"}
        </button>
        {receiptSelected ? (
          <p className="action-confirmation" role="status">
            Your new receipt is ready for review in this preview. No file was sent.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DelegationStatusTable({ delegates }: { delegates: NonNullable<PortalApplication["delegates"]> }) {
  return (
    <div className="delegation-status">
      <div className="delegation-status-heading">
        <div>
          <p className="section-overline">Delegation</p>
          <h3>Delegate progress</h3>
        </div>
        <span>{delegates.length} delegates</span>
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
            {delegates.map((delegate) => (
              <tr key={delegate.name}>
                <th scope="row">{delegate.name}</th>
                <td>{delegate.committee}</td>
                <td>{delegate.portfolio}</td>
                <td>
                  <span className={statusClass(delegate.status)}>{delegate.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        The head delegate can view each delegate&apos;s individual committee, portfolio
        and status.
      </p>
    </div>
  );
}
