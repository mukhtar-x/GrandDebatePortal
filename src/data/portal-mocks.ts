export type RegistrationType = "solo" | "delegation";

export type ApplicationStatus =
  | "submitted"
  | "payment-review"
  | "payment-confirmed"
  | "allocated"
  | "action-required"
  | "waitlisted";

export interface DelegatePreview {
  name: string;
  committee: string;
  portfolio: string;
  status: string;
}

export interface PortalApplication {
  applicationId: string;
  email: string;
  firstName: string;
  type: RegistrationType;
  status: ApplicationStatus;
  committee?: string;
  portfolio?: string;
  actionReason?: string;
  delegates?: DelegatePreview[];
}

const STORED_APPLICATIONS_KEY = "tgd26.mockApplications";

export const DEMO_APPLICATIONS: PortalApplication[] = [
  {
    applicationId: "TGD26-DEMO-1401",
    email: "review@tgd26.example",
    firstName: "Maira",
    type: "solo",
    status: "payment-review",
  },
  {
    applicationId: "TGD26-DEMO-2602",
    email: "delegation@tgd26.example",
    firstName: "Ayesha",
    type: "delegation",
    status: "allocated",
    delegates: [
      { name: "Ayesha Khan", committee: "UNSC", portfolio: "China", status: "Allocated" },
      { name: "Hamza Ali", committee: "DISEC", portfolio: "Brazil", status: "Allocated" },
      { name: "Noor Fatima", committee: "PNA", portfolio: "Member of Parliament", status: "Allocated" },
      { name: "Daniyal Ahmed", committee: "SOCHUM", portfolio: "Norway", status: "Payment confirmed" },
    ],
  },
  {
    applicationId: "TGD26-DEMO-3184",
    email: "action@tgd26.example",
    firstName: "Zara",
    type: "solo",
    status: "action-required",
    actionReason: "The payment screenshot was unclear.",
  },
  {
    applicationId: "TGD26-DEMO-5500",
    email: "waitlist@tgd26.example",
    firstName: "Hassan",
    type: "solo",
    status: "waitlisted",
  },
  {
    applicationId: "TGD26-DEMO-9007",
    email: "allocated@tgd26.example",
    firstName: "Ibrahim",
    type: "solo",
    status: "allocated",
    committee: "DISEC",
    portfolio: "Japan",
  },
  {
    applicationId: "TGD26-DEMO-4022",
    email: "confirmed@tgd26.example",
    firstName: "Samina",
    type: "solo",
    status: "payment-confirmed",
  },
];

function readStoredApplications(): PortalApplication[] {
  if (typeof window === "undefined") return [];

  try {
    const rawValue = window.sessionStorage.getItem(STORED_APPLICATIONS_KEY);
    if (!rawValue) return [];
    const value: unknown = JSON.parse(rawValue);
    return Array.isArray(value) ? (value as PortalApplication[]) : [];
  } catch {
    return [];
  }
}

export function findMockApplication(email: string, applicationId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedId = applicationId.trim().toLowerCase();
  const applications = [...readStoredApplications(), ...DEMO_APPLICATIONS];

  return (
    applications.find(
      (application) =>
        application.email.toLowerCase() === normalizedEmail &&
        application.applicationId.toLowerCase() === normalizedId,
    ) ?? null
  );
}

export function saveMockRegistration(input: {
  email: string;
  firstName: string;
  type: RegistrationType;
  delegateNames?: string[];
}) {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, "0");
  const application: PortalApplication = {
    applicationId: "TGD26-DEMO-" + suffix,
    email: input.email.trim(),
    firstName: input.firstName.trim(),
    type: input.type,
    status: "submitted",
    delegates: input.delegateNames?.map((name) => ({
      name,
      committee: "Pending",
      portfolio: "Pending",
      status: "Submitted",
    })),
  };

  if (typeof window !== "undefined") {
    try {
      const existing = readStoredApplications();
      window.sessionStorage.setItem(
        STORED_APPLICATIONS_KEY,
        JSON.stringify([application, ...existing]),
      );
    } catch {
      // The confirmation view can still show the mock application ID if storage is unavailable.
    }
  }

  return application;
}
