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
  baCode: string;
  idempotencyKey: string;
  reservationToken: string;
  /** Honeypot; real users leave it empty. */
  website: string;
}

export interface RegistrationSuccess {
  applicationId: string;
  firstName: string;
  totalPayable: number;
  rateType: string;
  challanNumber: string;
  test?: boolean;
}

export interface ChallanReservation {
  reservationToken: string;
  challanNumber: string;
  amount: number;
  rateType: string;
  expiresAt: string;
  graceUntil: string;
  test: boolean;
  resumed?: boolean;
}

export type ApiFailure = { ok: false; error: string; field?: string; code?: string };

export type RegistrationResult = { ok: true; data: RegistrationSuccess } | ApiFailure;

export type ReservationResult = { ok: true; data: ChallanReservation } | ApiFailure;

function toApiExperience(value: string) {
  return EXPERIENCE_TO_API[value] ?? value;
}

export function buildRegistrationDetails(input: Pick<RegistrationInput, "type" | "solo" | "delegation" | "baCode">) {
  const common = { baCode: input.baCode.trim() || undefined };
  if (input.type === "solo") {
    const { solo } = input;
    return {
      ...common,
      participantType: "solo",
      institution: solo.institution,
      delegates: [{
        fullName: solo.fullName,
        email: solo.email,
        whatsappNumber: solo.whatsapp,
        experienceLevel: toApiExperience(solo.experience),
        additionalInfo: solo.additionalInformation || undefined,
        firstPreference: solo.firstPreference,
        secondPreference: solo.secondPreference,
      }],
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

function buildPayload(input: RegistrationInput) {
  const details = buildRegistrationDetails(input);
  const common = {
    transactionId: input.transactionId.trim() || undefined,
    baCode: input.baCode.trim() || undefined,
    idempotencyKey: input.idempotencyKey,
    website: input.website,
  };

  return {
    ...details,
    ...common,
    reservationToken: input.reservationToken,
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
  baCode: "BA Code",
  reservationToken: "Challan",
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

export async function reserveChallan(input: {
  registration: ReturnType<typeof buildRegistrationDetails>;
  /** Links every challan generated during one form fill; the same key is used to submit. */
  draftId: string;
  /** The challan being replaced, if the details changed after it was generated. */
  previousReservationToken?: string;
  website: string;
}): Promise<ReservationResult> {
  try {
    const response = await fetch("/api/challans/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      return {
        ok: false,
        error: body?.error ?? "A challan could not be reserved. Please try again.",
        field: body?.field,
        code: body?.code,
      };
    }
    return { ok: true, data: body as ChallanReservation };
  } catch {
    return { ok: false, error: "We could not reach the server. Please check your connection and try again." };
  }
}

export async function releaseChallan(reservationToken: string) {
  try {
    await fetch("/api/challans/reserve", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationToken }),
    });
  } catch {
    // A lost release request is harmless: the challan returns to the pool after its grace period anyway.
  }
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
          challanNumber: body.challanNumber,
          test: body.test === true,
        },
      };
    }
    return {
      ok: false,
      error: body?.error ?? "Registration could not be completed. Please try again.",
      field: body?.field,
      code: body?.code,
    };
  } catch {
    return {
      ok: false,
      error: "We could not reach the server. Please check your connection and try again.",
    };
  }
}
