"use client";

import { useEffect, useRef, useState } from "react";
import {
  EXPERIENCE_OPTIONS,
  MAX_DELEGATION_SIZE,
  MIN_DELEGATION_SIZE,
} from "@/data/event";
import { CommitteePreferences } from "@/components/registration/committee-preferences";
import { formatWhatsAppNumber } from "@/components/registration/types";
import type {
  DelegateFormValues,
  DelegationFormValues,
} from "@/components/registration/types";
import { InputField, SelectField } from "@/components/ui/form-fields";

const experienceOptions = EXPERIENCE_OPTIONS.map((experience) => ({
  value: experience,
  label: experience,
}));
const sizeOptions = Array.from(
  { length: MAX_DELEGATION_SIZE - MIN_DELEGATION_SIZE + 1 },
  (_, index) => MIN_DELEGATION_SIZE + index,
).map((size) => ({
  value: String(size),
  label: size + " delegates",
}));

/** Same rules the browser checks: every field filled and two different committees. */
export function isDelegateComplete(delegate: DelegateFormValues) {
  return (
    Boolean(delegate.fullName.trim() && delegate.email.trim() && delegate.whatsapp.trim() && delegate.experience) &&
    Boolean(delegate.firstPreference && delegate.secondPreference) &&
    delegate.firstPreference !== delegate.secondPreference
  );
}

/** Opens the collapsed card holding an element (for focus and validation), then focuses it. */
export function revealAndFocus(element: HTMLElement | null) {
  const card = element?.closest("details");
  if (card && !card.open) card.open = true;
  element?.focus();
}

interface DelegationFieldsProps {
  value: DelegationFormValues;
  onFieldChange: (field: "institution" | "headName" | "headEmail" | "headWhatsapp", value: string) => void;
  onSizeChange: (size: number) => void;
  onHeadIsDelegateChange: (checked: boolean) => void;
  onDelegateChange: (
    index: number,
    field: keyof DelegateFormValues,
    value: string,
  ) => void;
  onRemoveDelegate: (index: number) => void;
}

export function DelegationFields({
  value,
  onFieldChange,
  onSizeChange,
  onHeadIsDelegateChange,
  onDelegateChange,
  onRemoveDelegate,
}: DelegationFieldsProps) {
  const focusDelegateIndex = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const completeCount = value.delegates.filter(isDelegateComplete).length;

  useEffect(() => {
    const index = focusDelegateIndex.current;
    if (index === null) return;

    revealAndFocus(document.getElementById(`delegate-${index}-name`));
    focusDelegateIndex.current = null;
  }, [value.delegates.length]);

  return (
    <>
      <section className="form-subsection">
        <div className="form-subsection-heading">
          <span className="subsection-index">A</span>
          <div>
            <h3>Delegation details</h3>
            <p>Your group must be from the same institution.</p>
          </div>
        </div>
        <div className="field-grid">
          <InputField
            id="delegation-institution"
            name="institution"
            label="Institution"
            placeholder="School, college or university"
            autoComplete="organization"
            autoCapitalize="words"
            onBlur={(event) => onFieldChange("institution", event.currentTarget.value.trim().replace(/\s+/g, " "))}
            value={value.institution}
            onChange={(event) => onFieldChange("institution", event.currentTarget.value)}
            required
          />
          <SelectField
            id="delegation-size"
            name="delegationSize"
            label="Delegation size"
            value={String(value.size)}
            onChange={(event) => onSizeChange(Number(event.currentTarget.value))}
            options={sizeOptions}
            placeholder="Select delegation size"
            required
            hint={`Choose between ${MIN_DELEGATION_SIZE} and ${MAX_DELEGATION_SIZE} delegates.`}
          />
        </div>
      </section>

      <section className="form-subsection">
        <div className="form-subsection-heading">
          <span className="subsection-index">B</span>
          <div>
            <h3>Head delegate</h3>
            <p>The primary contact for all delegation correspondence.</p>
          </div>
        </div>
        <div className="field-grid">
          <InputField
            id="head-name"
            name="headDelegateFullName"
            label="Full name"
            autoComplete="name"
            autoCapitalize="words"
            onBlur={(event) => onFieldChange("headName", event.currentTarget.value.trim().replace(/\s+/g, " "))}
            value={value.headName}
            onChange={(event) => onFieldChange("headName", event.currentTarget.value)}
            required
          />
          <InputField
            id="head-email"
            name="headDelegateEmail"
            type="email"
            label="Email address"
            placeholder="e.g. name@school.edu.pk"
            autoComplete="email"
            onBlur={(event) => onFieldChange("headEmail", event.currentTarget.value.trim().toLowerCase())}
            value={value.headEmail}
            onChange={(event) => onFieldChange("headEmail", event.currentTarget.value)}
            required
            hint="All correspondence will be sent here."
          />
          <InputField
            id="head-whatsapp"
            name="headDelegateWhatsapp"
            type="tel"
            label="WhatsApp number"
            placeholder="e.g. 0300 1234567"
            autoComplete="tel"
            inputMode="tel"
            onBlur={(event) => onFieldChange("headWhatsapp", formatWhatsAppNumber(event.currentTarget.value))}
            pattern="\+?[0-9\s\x28\x29\x2d]{10,18}"
            title="Enter a valid number with country code."
            value={value.headWhatsapp}
            onChange={(event) => onFieldChange("headWhatsapp", event.currentTarget.value)}
            required
          />
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.headIsDelegate}
            onChange={(event) => onHeadIsDelegateChange(event.currentTarget.checked)}
          />
          <span>
            <strong>The head delegate is also a delegate</strong>
            <small>We will enter their contact details as Delegate 1.</small>
          </span>
        </label>
      </section>

      <section className="form-subsection">
        <div className="form-subsection-heading">
          <span className="subsection-index">C</span>
          <div>
            <h3>Delegate details</h3>
            <p>
              Add the {value.size} delegates in your group. Open each card to fill it in;
              {" "}{completeCount} of {value.size} complete.
            </p>
          </div>
        </div>
        <div className="delegate-list">
          {value.delegates.map((delegate, index) => {
            const isHeadDelegate = value.headIsDelegate && index === 0;
            const complete = isDelegateComplete(delegate);
            const summary = [
              delegate.fullName.trim(),
              delegate.firstPreference && delegate.secondPreference
                ? `${delegate.firstPreference} / ${delegate.secondPreference}`
                : "",
            ].filter(Boolean).join(" · ");
            return (
              // Native details: one card open at a time (shared name), and every input stays in the
              // form so the browser can still validate collapsed cards.
              <details className="delegate-card" key={index} name="delegate-cards" open={index === 0}>
                <summary className="delegate-card-heading">
                  <span className="delegate-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="delegate-card-title">
                    <strong>Delegate {index + 1}</strong>
                    <span className="delegate-card-summary">{summary || "Not filled in yet"}</span>
                  </span>
                  <span className="delegate-heading-actions">
                    {isHeadDelegate ? <span className="small-tag">Head delegate</span> : null}
                    <span className={complete ? "delegate-status is-complete" : "delegate-status"}>
                      {complete ? "Complete" : "Incomplete"}
                    </span>
                    <span className="delegate-chevron" aria-hidden="true" />
                  </span>
                </summary>
                <div className="delegate-card-body">
                  <div className="field-grid">
                    <InputField
                      id={"delegate-" + index + "-name"}
                      name={"delegates[" + index + "][fullName]"}
                      label="Full name"
                      autoComplete="name"
                      autoCapitalize="words"
                      onBlur={(event) => onDelegateChange(index, "fullName", event.currentTarget.value.trim().replace(/\s+/g, " "))}
                      value={delegate.fullName}
                      readOnly={isHeadDelegate}
                      onChange={(event) =>
                        onDelegateChange(index, "fullName", event.currentTarget.value)
                      }
                      required
                    />
                    <InputField
                      id={"delegate-" + index + "-email"}
                      name={"delegates[" + index + "][email]"}
                      type="email"
                      label="Email address"
                      autoComplete="email"
                      onBlur={(event) => onDelegateChange(index, "email", event.currentTarget.value.trim().toLowerCase())}
                      value={delegate.email}
                      readOnly={isHeadDelegate}
                      onChange={(event) =>
                        onDelegateChange(index, "email", event.currentTarget.value)
                      }
                      required
                    />
                    <InputField
                      id={"delegate-" + index + "-whatsapp"}
                      name={"delegates[" + index + "][whatsapp]"}
                      type="tel"
                      label="WhatsApp number"
                      placeholder="e.g. 0300 1234567"
                      autoComplete="tel"
                      inputMode="tel"
                      onBlur={(event) => onDelegateChange(index, "whatsapp", formatWhatsAppNumber(event.currentTarget.value))}
                      pattern="\+?[0-9\s\x28\x29\x2d]{10,18}"
                      title="Enter a valid number with country code."
                      value={delegate.whatsapp}
                      readOnly={isHeadDelegate}
                      onChange={(event) =>
                        onDelegateChange(index, "whatsapp", event.currentTarget.value)
                      }
                      required
                    />
                    <SelectField
                      id={"delegate-" + index + "-experience"}
                      name={"delegates[" + index + "][experience]"}
                      label="Prior MUN experience"
                      value={delegate.experience}
                      onChange={(event) =>
                        onDelegateChange(index, "experience", event.currentTarget.value)
                      }
                      options={experienceOptions}
                      required
                    />
                  </div>
                  <CommitteePreferences
                    idPrefix={"delegate-" + index}
                    firstPreference={delegate.firstPreference}
                    secondPreference={delegate.secondPreference}
                    onFirstPreferenceChange={(next) => {
                      onDelegateChange(index, "firstPreference", next);
                      if (delegate.secondPreference === next) {
                        onDelegateChange(index, "secondPreference", "");
                      }
                    }}
                    onSecondPreferenceChange={(next) =>
                      onDelegateChange(index, "secondPreference", next)
                    }
                  />
                  {value.size > MIN_DELEGATION_SIZE ? (
                    <button
                      className="delegate-remove-link"
                      type="button"
                      onClick={() => {
                        focusDelegateIndex.current = Math.max(0, index - 1);
                        setAnnouncement(
                          `Delegate ${index + 1} removed. ${value.size - 1} delegates remain.`,
                        );
                        onRemoveDelegate(index);
                      }}
                    >
                      Remove delegate {index + 1}
                    </button>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
        <div className="delegate-controls">
          <span>
            Minimum {MIN_DELEGATION_SIZE} · {value.size} of {MAX_DELEGATION_SIZE} selected
          </span>
          <button
            className="button button-secondary add-delegate-button"
            type="button"
            onClick={() => {
              focusDelegateIndex.current = value.size;
              onSizeChange(Math.min(value.size + 1, MAX_DELEGATION_SIZE));
            }}
            disabled={value.size >= MAX_DELEGATION_SIZE}
          >
            {value.size >= MAX_DELEGATION_SIZE ? "Maximum reached" : "+ Add delegate"}
          </button>
        </div>
        <span className="visually-hidden" aria-live="polite">{announcement}</span>
      </section>
    </>
  );
}
