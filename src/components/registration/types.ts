import { MIN_DELEGATION_SIZE } from "@/data/event";

export type RegistrationType = "solo" | "delegation";

export function formatWhatsAppNumber(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const digits = trimmed.replace(/\D/g, "");
  const pakistaniDigits = digits.startsWith("92") ? digits.slice(2) : digits;
  const mobileDigits = pakistaniDigits.startsWith("03")
    ? pakistaniDigits.slice(1)
    : pakistaniDigits;
  if (/^3\d{9}$/.test(mobileDigits)) {
    return `+92 ${mobileDigits.slice(0, 3)} ${mobileDigits.slice(3)}`;
  }
  return trimmed;
}

export interface SoloFormValues {
  fullName: string;
  email: string;
  whatsapp: string;
  institution: string;
  experience: string;
  additionalInformation: string;
  firstPreference: string;
  secondPreference: string;
}

export interface DelegateFormValues {
  fullName: string;
  email: string;
  whatsapp: string;
  experience: string;
  firstPreference: string;
  secondPreference: string;
}

export interface DelegationFormValues {
  institution: string;
  size: number;
  headName: string;
  headEmail: string;
  headWhatsapp: string;
  headIsDelegate: boolean;
  delegates: DelegateFormValues[];
}

export function emptyDelegate(): DelegateFormValues {
  return {
    fullName: "",
    email: "",
    whatsapp: "",
    experience: "",
    firstPreference: "",
    secondPreference: "",
  };
}

export function emptyDelegation(): DelegationFormValues {
  return {
    institution: "",
    size: MIN_DELEGATION_SIZE,
    headName: "",
    headEmail: "",
    headWhatsapp: "",
    headIsDelegate: false,
    delegates: Array.from({ length: MIN_DELEGATION_SIZE }, emptyDelegate),
  };
}

export function emptySoloForm(): SoloFormValues {
  return {
    fullName: "",
    email: "",
    whatsapp: "",
    institution: "",
    experience: "",
    additionalInformation: "",
    firstPreference: "",
    secondPreference: "",
  };
}
