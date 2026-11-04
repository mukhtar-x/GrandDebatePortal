import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type FieldCopy = {
  label: string;
  hint?: string;
};

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> &
  FieldCopy & { id: string };

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldCopy & {
    id: string;
    options: readonly { value: string; label: string }[];
    placeholder?: string;
  };

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  FieldCopy & { id: string };

/** Label text, marking fields people may leave empty. Read-only fields are filled for them. */
function FieldLabel({ label, required, readOnly }: { label: string; required?: boolean; readOnly?: boolean }) {
  return (
    <span className="field-label">
      {label}
      {!required && !readOnly ? <span className="field-optional"> (optional)</span> : null}
    </span>
  );
}

/** Links the hint to the control so screen readers read it with the field. */
function describedBy(id: string, hint: string | undefined, existing: string | undefined) {
  return [existing, hint ? `${id}-hint` : undefined].filter(Boolean).join(" ") || undefined;
}

function FieldHint({ id, hint }: { id: string; hint?: string }) {
  return hint ? <span className="field-hint" id={`${id}-hint`}>{hint}</span> : null;
}

export function InputField({ id, label, hint, className, ...props }: InputFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <FieldLabel label={label} required={props.required} readOnly={props.readOnly} />
      <input
        id={id}
        className={className ? "form-control " + className : "form-control"}
        {...props}
        aria-describedby={describedBy(id, hint, props["aria-describedby"])}
      />
      <FieldHint id={id} hint={hint} />
    </label>
  );
}

export function SelectField({
  id,
  label,
  hint,
  options,
  placeholder = "Choose an option",
  className,
  ...props
}: SelectFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <FieldLabel label={label} required={props.required} />
      <select
        id={id}
        className={className ? "form-control " + className : "form-control"}
        {...props}
        aria-describedby={describedBy(id, hint, props["aria-describedby"])}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldHint id={id} hint={hint} />
    </label>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  className,
  ...props
}: TextAreaFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <FieldLabel label={label} required={props.required} readOnly={props.readOnly} />
      <textarea
        id={id}
        className={className ? "form-control " + className : "form-control"}
        {...props}
        aria-describedby={describedBy(id, hint, props["aria-describedby"])}
      />
      <FieldHint id={id} hint={hint} />
    </label>
  );
}
