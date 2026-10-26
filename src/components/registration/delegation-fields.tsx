"use client";

import { useEffect, useRef, useState } from "react";
import {
  EXPERIENCE_OPTIONS,
  MAX_DELEGATION_SIZE,
  MIN_DELEGATION_SIZE,
} from "@/data/event";
import { CommitteePreferences } from "@/components/registration/committee-preferences";
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

  useEffect(() => {
    const index = focusDelegateIndex.current;
    if (index === null) return;

    document.getElementById(`delegate-${index}-name`)?.focus();
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
            value={value.headName}
            onChange={(event) => onFieldChange("headName", event.currentTarget.value)}
            required
          />
          <InputField
            id="head-email"
            name="headDelegateEmail"
            type="email"
            label="Email address"
            placeholder="you@example.com"
            autoComplete="email"
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
            placeholder="+92 300 1234567"
            autoComplete="tel"
            pattern="\+?[0-9\s()-]{10,18}"
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
              Add the {value.size} delegates in your group. Each delegate selects two
              committee preferences.
            </p>
          </div>
        </div>
        <div className="delegate-list">
          {value.delegates.map((delegate, index) => {
            const isHeadDelegate = value.headIsDelegate && index === 0;
            return (
              <article className="delegate-card" key={index}>
                <div className="delegate-card-heading">
                  <span className="delegate-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h4>Delegate {index + 1}</h4>
                  <div className="delegate-heading-actions">
                    {isHeadDelegate ? <span className="small-tag">Head delegate</span> : null}
                    <button
                      className="delegate-remove-button"
                      type="button"
                      aria-label={`Remove delegate ${index + 1}`}
                      title={
                        value.size <= MIN_DELEGATION_SIZE
                          ? `A delegation must include at least ${MIN_DELEGATION_SIZE} delegates.`
                          : undefined
                      }
                      disabled={value.size <= MIN_DELEGATION_SIZE}
                      onClick={() => {
                        focusDelegateIndex.current = Math.max(0, index - 1);
                        setAnnouncement(
                          `Delegate ${index + 1} removed. ${value.size - 1} delegates remain.`,
                        );
                        onRemoveDelegate(index);
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        focusable="false"
                      >
                        <path d="M4.5 7h15M9 7V4.75h6V7m-8.25 0 .8 12.25h8.9L17.25 7M10 10.5v5.75m4-5.75v5.75" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="field-grid">
                  <InputField
                    id={"delegate-" + index + "-name"}
                    name={"delegates[" + index + "][fullName]"}
                    label="Full name"
                    autoComplete="name"
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
                    placeholder="+92 300 1234567"
                    autoComplete="tel"
                    pattern="\+?[0-9\s()-]{10,18}"
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
              </article>
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
            onClick={() =>
              onSizeChange(Math.min(value.size + 1, MAX_DELEGATION_SIZE))
            }
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
