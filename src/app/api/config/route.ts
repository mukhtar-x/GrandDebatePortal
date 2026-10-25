import { connection } from "next/server";
import { EVENT_INFO } from "@/lib/eventInfo";
import { PAYMENT_DETAILS } from "@/lib/paymentDetails";
import {
    EARLY_BIRD_DEADLINE,
    EARLY_BIRD_PRICE,
    REGISTRATION_CLOSED_AT,
    REGULAR_PRICE,
    getRegistrationPhase,
} from "@/lib/pricing";

const BANNERS = {
    early: {
        text: "Early bird registration is open until 7 November. Delegates who register now pay PKR 2,000 instead of PKR 2,400.",
        button: null,
    },
    regular: {
        text: "Early bird registration has closed. Regular registration remains open until 15 November. Delegate fee: PKR 2,400.",
        button: null,
    },
    closed: {
        text: "Registration is now closed. Registered delegates may track their application through the portal.",
        button: { label: "Go to Portal", href: "/portal" },
    },
} as const;

const DELEGATE_COUNTS = [1, 4, 5, 6, 7];

/** Everything the public pages need that depends on the current date or on organiser settings. */
export async function GET(): Promise<Response> {
    await connection();
    const now = new Date();
    const phase = getRegistrationPhase(now);

    return Response.json({
        success: true,
        serverTime: now.toISOString(),
        event: EVENT_INFO,
        registration: {
            phase,
            open: phase !== "closed",
            banner: BANNERS[phase],
            currentFee: phase === "early" ? EARLY_BIRD_PRICE : phase === "regular" ? REGULAR_PRICE : null,
            rateLabel: phase === "early" ? "Early bird rate applied." : phase === "regular" ? "Regular rate applied." : null,
            earlyBirdDeadline: EARLY_BIRD_DEADLINE.toISOString(),
            closesAt: REGISTRATION_CLOSED_AT.toISOString(),
            fees: { earlyBird: EARLY_BIRD_PRICE, regular: REGULAR_PRICE },
            totals: DELEGATE_COUNTS.map((delegates) => ({
                delegates,
                earlyBird: delegates * EARLY_BIRD_PRICE,
                regular: delegates * REGULAR_PRICE,
            })),
        },
        payment: PAYMENT_DETAILS.confirmed
            ? {
                  confirmed: true,
                  accountTitle: PAYMENT_DETAILS.accountTitle,
                  provider: PAYMENT_DETAILS.provider,
                  accountNumber: PAYMENT_DETAILS.accountNumber,
                  iban: PAYMENT_DETAILS.iban,
              }
            : { confirmed: false, message: "Payment details to be confirmed." },
    });
}
