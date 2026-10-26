import type {
  DelegationFormValues,
  RegistrationType,
  SoloFormValues,
} from "@/components/registration/types";

/** Form labels → values accepted by POST /api/register. */
const EXPERIENCE_TO_API: Record<string, string> = {
  None: "None",
  "1 to 3 conferences": "1 to 3 conferences",
  "4 or more conferences": "4 or more",
  "Chair or Executive Board experience": "Chair or EB",
};

export interface RegistrationInput {
  type: RegistrationType;
  solo: SoloFormValues;
  delegation: DelegationFormValues;
  receipt: File;
  transactionId: string;
  idempotencyKey: string;
}

export interface RegistrationSuccess {
  applicationId: string;
  firstName: string;
  totalPayable: number;
  rateType: string;
}

export type RegistrationResult =
  | { ok: true; data: RegistrationSuccess }
  | { ok: false; error: string; field?: string };

function toApiExperience(value: string) {
  return EXPERIENCE_TO_API[value] ?? value;
}

function buildPayload(input: RegistrationInput) {
  const common = {
    transactionId: input.transactionId.trim() || undefined,
    idempotencyKey: input.idempotencyKey,
  };

  if (input.type === "solo") {
    const { solo } = input;
    return {
      ...common,
      participantType: "solo",
      institution: solo.institution,
      delegates: [
        {
          fullName: solo.fullName,
          email: solo.email,
          whatsappNumber: solo.whatsapp,
          experienceLevel: toApiExperience(solo.experience),
          additionalInfo: solo.additionalInformation || undefined,
          firstPreference: solo.firstPreference,
          secondPreference: solo.secondPreference,
        },
      ],
    };
  }

  const { delegation } = input;
  return {
    ...common,
    participantType: "delegation",
    institution: delegation.institution,
    headName: delegation.headName,
    headEmail: delegation.headEmail,
    headWhatsapp: delegation.headWhatsapp,
    headIsDelegate: delegation.headIsDelegate,
    delegates: delegation.delegates.map((delegate) => ({
      fullName: delegate.fullName,
      email: delegate.email,
      whatsappNumber: delegate.whatsapp,
      experienceLevel: toApiExperience(delegate.experience),
      firstPreference: delegate.firstPreference,
      secondPreference: delegate.secondPreference,
    })),
  };
}

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  email: "Email",
  whatsappNumber: "WhatsApp number",
  experienceLevel: "Prior MUN experience",
  additionalInfo: "Additional information",
  firstPreference: "First preference",
  secondPreference: "Second preference",
  institution: "Institution",
  headName: "Head delegate name",
  headEmail: "Head delegate email",
  headWhatsapp: "Head delegate WhatsApp number",
  receipt: "Payment screenshot",
  transactionId: "Transaction ID",
  delegates: "Delegates",
};

/** Turns an API field path such as "delegates[2].email" into "Delegate 3 · Email". */
export function describeField(field: string, type: RegistrationType) {
  const match = field.match(/^delegates\[(\d+)\]\.(\w+)$/);
  if (match) {
    const label = FIELD_LABELS[match[2]] ?? match[2];
    return type === "solo" ? label : "Delegate " + (Number(match[1]) + 1) + " · " + label;
  }
  return FIELD_LABELS[field] ?? field;
}

export async function submitRegistration(input: RegistrationInput): Promise<RegistrationResult> {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(buildPayload(input)));
  formData.append("receipt", input.receipt);

  try {
    const response = await fetch("/api/register", { method: "POST", body: formData });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.success) {
      return {
        ok: true,
        data: {
          applicationId: body.applicationId,
          firstName: body.firstName,
          totalPayable: body.totalPayable,
          rateType: body.rateType,
        },
      };
    }
    return {
      ok: false,
      error: body?.error ?? "Registration could not be completed. Please try again.",
      field: body?.field,
    };
  } catch {
    return {
      ok: false,
      error: "We could not reach the server. Please check your connection and try again.",
    };
  }
}
