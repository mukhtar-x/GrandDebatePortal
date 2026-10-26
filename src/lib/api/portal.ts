import type { RegistrationType } from "@/components/registration/types";

export type ApplicationStatus =
  | "submitted"
  | "payment-review"
  | "payment-confirmed"
  | "allocated"
  | "action-required"
  | "waitlisted";

export interface DelegateRow {
  name: string;
  committee: string | null;
  portfolio: string | null;
  status: string;
  isHead: boolean;
}

/** Shape returned by POST /api/status. */
export interface PortalApplication {
  applicationId: string;
  firstName: string;
  type: RegistrationType;
  institution: string | null;
  isHeadView: boolean;
  status: ApplicationStatus;
  stage: number;
  message: string;
  actionReason: string | null;
  canResubmitReceipt: boolean;
  committee: string | null;
  committeeName: string | null;
  portfolio: string | null;
  studyGuideUrl: string | null;
  delegates?: DelegateRow[];
}

export type PortalResult =
  | { ok: true; application: PortalApplication }
  | { ok: false; error: string };

const NETWORK_ERROR =
  "We could not reach the server. Please check your connection and try again.";

function toApplication(body: Record<string, unknown>): PortalApplication {
  return { ...(body as unknown as PortalApplication), status: body.statusKey as ApplicationStatus };
}

async function readResult(response: Response, fallback: string): Promise<PortalResult> {
  const body = await response.json().catch(() => null);
  if (response.ok && body?.success) return { ok: true, application: toApplication(body) };
  return { ok: false, error: body?.error ?? fallback };
}

export async function lookupApplication(email: string, applicationId: string): Promise<PortalResult> {
  try {
    const response = await fetch("/api/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, applicationId }),
    });
    return readResult(response, "Application status could not be retrieved. Please try again.");
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function resubmitReceipt(
  email: string,
  applicationId: string,
  receipt: File,
): Promise<PortalResult> {
  const formData = new FormData();
  formData.append("email", email);
  formData.append("applicationId", applicationId);
  formData.append("receipt", receipt);

  try {
    const response = await fetch("/api/status/receipt", { method: "POST", body: formData });
    return readResult(response, "Your receipt could not be uploaded. Please try again.");
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
