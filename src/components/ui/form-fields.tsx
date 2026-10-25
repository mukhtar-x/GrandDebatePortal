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

export function InputField({ id, label, hint, className, ...props }: InputFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id}
        className={className ? "form-control " + className : "form-control"}
        {...props}
      />
      {hint ? <span className="field-hint">{hint}</span> : null}
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
      <span className="field-label">{label}</span>
      <select
        id={id}
        className={className ? "form-control " + className : "form-control"}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="field-hint">{hint}</span> : null}
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
      <span className="field-label">{label}</span>
      <textarea
        id={id}
        className={className ? "form-control " + className : "form-control"}
        {...props}
      />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
