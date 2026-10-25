import { EXPERIENCE_OPTIONS } from "@/data/event";
import { InputField, SelectField, TextAreaField } from "@/components/ui/form-fields";
import { CommitteePreferences } from "@/components/registration/committee-preferences";
import type { SoloFormValues } from "@/components/registration/types";

const experienceOptions = EXPERIENCE_OPTIONS.map((experience) => ({
  value: experience,
  label: experience,
}));

interface SoloDelegateFieldsProps {
  value: SoloFormValues;
  onChange: (field: keyof SoloFormValues, value: string) => void;
}

export function SoloDelegateFields({ value, onChange }: SoloDelegateFieldsProps) {
  return (
    <>
      <div className="field-grid">
        <InputField
          id="solo-full-name"
          name="fullName"
          label="Full name"
          placeholder="Name as it should appear on your name card"
          autoComplete="name"
          value={value.fullName}
          onChange={(event) => onChange("fullName", event.currentTarget.value)}
          required
        />
        <InputField
          id="solo-email"
          name="email"
          type="email"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          value={value.email}
          onChange={(event) => onChange("email", event.currentTarget.value)}
          required
          hint="Your application ID will be sent to this address."
        />
        <InputField
          id="solo-whatsapp"
          name="whatsapp"
          type="tel"
          label="WhatsApp number"
          placeholder="+92 300 1234567"
          autoComplete="tel"
          pattern="\+?[0-9\s()-]{10,18}"
          title="Enter a valid number with country code."
          value={value.whatsapp}
          onChange={(event) => onChange("whatsapp", event.currentTarget.value)}
          required
          hint="Include your country code. Used for urgent updates only."
        />
        <InputField
          id="solo-institution"
          name="institution"
          label="Institution"
          placeholder="School, college or university"
          autoComplete="organization"
          value={value.institution}
          onChange={(event) => onChange("institution", event.currentTarget.value)}
          required
        />
      </div>

      <div className="field-grid field-grid-single">
        <SelectField
          id="solo-experience"
          name="experience"
          label="Prior MUN experience"
          value={value.experience}
          onChange={(event) => onChange("experience", event.currentTarget.value)}
          options={experienceOptions}
          required
          hint="This helps organisers place delegates appropriately."
        />
        <TextAreaField
          id="solo-additional-information"
          name="additionalInformation"
          label="Additional information"
          placeholder="Previous committees, awards or other relevant experience"
          value={value.additionalInformation}
          onChange={(event) =>
            onChange("additionalInformation", event.currentTarget.value)
          }
          rows={3}
        />
      </div>

      <CommitteePreferences
        idPrefix="solo"
        firstPreference={value.firstPreference}
        secondPreference={value.secondPreference}
        onFirstPreferenceChange={(next) => {
          onChange("firstPreference", next);
          if (value.secondPreference === next) onChange("secondPreference", "");
        }}
        onSecondPreferenceChange={(next) => onChange("secondPreference", next)}
      />
    </>
  );
}
