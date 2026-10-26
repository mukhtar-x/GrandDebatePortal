import { COMMITTEES } from "@/data/event";
import { SelectField } from "@/components/ui/form-fields";

const committeeOptions = COMMITTEES.map((committee) => ({
  value: committee.code,
  label: committee.code + " · " + committee.name,
}));

interface CommitteePreferencesProps {
  idPrefix: string;
  firstPreference: string;
  secondPreference: string;
  onFirstPreferenceChange: (value: string) => void;
  onSecondPreferenceChange: (value: string) => void;
}

export function CommitteePreferences({
  idPrefix,
  firstPreference,
  secondPreference,
  onFirstPreferenceChange,
  onSecondPreferenceChange,
}: CommitteePreferencesProps) {
  const secondOptions = committeeOptions.filter(
    (committee) => committee.value !== firstPreference,
  );

  return (
    <div className="field-grid">
      <SelectField
        id={idPrefix + "-first-preference"}
        name={idPrefix + "FirstPreference"}
        label="First preference"
        value={firstPreference}
        onChange={(event) => onFirstPreferenceChange(event.currentTarget.value)}
        options={committeeOptions}
        required
      />
      <SelectField
        id={idPrefix + "-second-preference"}
        name={idPrefix + "SecondPreference"}
        label="Second preference"
        value={secondPreference}
        onChange={(event) => onSecondPreferenceChange(event.currentTarget.value)}
        options={secondOptions}
        required
        hint="Choose a different committee from your first preference."
      />
    </div>
  );
}
