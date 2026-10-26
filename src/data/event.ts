export const EVENT_DETAILS = {
  name: "The Grand Debate '26",
  dates: "18–20 November 2026",
  dailyHours: "8:00 AM to 4:00 PM",
  venue: "FAST-NUCES Karachi Main Campus, National Highway",
  organizer: "TLC, The Literary Club, FAST-NUCES Karachi",
  contactEmail: "tlc.khi@nu.edu.pk",
  contactPhone: "0314 3552058",
} as const;

export const MIN_DELEGATION_SIZE = 4;
export const MAX_DELEGATION_SIZE = 7;

export const COMMITTEES = [
  { code: "UNSC", name: "United Nations Security Council" },
  { code: "DISEC", name: "Disarmament and International Security Committee" },
  { code: "SOCHUM", name: "Social, Humanitarian and Cultural Committee" },
  {
    code: "UN Women",
    name: "United Nations Entity for Gender Equality and the Empowerment of Women",
  },
  { code: "PNA", name: "Pakistan National Assembly" },
] as const;

export const EXPERIENCE_OPTIONS = [
  "None",
  "1 to 3 conferences",
  "4 or more conferences",
  "Chair or Executive Board experience",
] as const;

const EARLY_BIRD_WINDOW = {
  key: "earlyBird",
  name: "Early bird",
  feePerDelegate: 2000,
  deadline: "7 November 2026",
  description:
    "Early bird registration is open until 7 November. Delegates who register now pay PKR 2,000 instead of PKR 2,400.",
} as const;

const REGULAR_WINDOW = {
  key: "regular",
  name: "Regular",
  feePerDelegate: 2400,
  deadline: "15 November 2026",
  description:
    "Early bird registration has closed. Regular registration remains open until 15 November. Delegate fee: PKR 2,400.",
} as const;

const CLOSED_WINDOW = {
  key: "closed",
  name: "Registration closed",
  feePerDelegate: 0,
  deadline: "15 November 2026",
  description:
    "Registration is now closed. Registered delegates may track their application through the portal.",
} as const;

export type RegistrationWindow =
  | typeof EARLY_BIRD_WINDOW
  | typeof REGULAR_WINDOW
  | typeof CLOSED_WINDOW;

export const CURRENT_REGISTRATION_WINDOW = EARLY_BIRD_WINDOW;

export function getCurrentRegistrationWindow(now = new Date()): RegistrationWindow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const dateKey = year + "-" + month + "-" + day;

  if (dateKey <= "2026-11-07") return EARLY_BIRD_WINDOW;
  if (dateKey <= "2026-11-15") return REGULAR_WINDOW;
  return CLOSED_WINDOW;
}

export const REGISTRATION_FEES = {
  earlyBird: 2000,
  regular: 2400,
} as const;

export function formatPKR(amount: number) {
  return "PKR " + amount.toLocaleString("en-PK");
}
