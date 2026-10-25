import connectDB from "@/lib/db";
import { EVENT_INFO } from "@/lib/eventInfo";
import { firstName } from "@/lib/validation";
import Application from "@/models/Application";
import Committee from "@/models/Committee";
import Delegate from "@/models/Delegate";

/**
 * Applicant notifications. Messages and trigger points are wired in; only the transport is
 * missing. To send real email, replace `consoleTransport` in `getTransport()` with an SMTP
 * transport (e.g. Nodemailer) — no other file needs to change.
 */
export interface MailMessage {
    event: MailEvent["type"];
    applicationId: string;
    to: string;
    subject: string;
    text: string;
}

export type MailTransport = (message: MailMessage) => Promise<void>;

export type MailEvent =
    | { type: "registrationReceived"; totalPayable: number; rateType: string }
    | { type: "receiptResubmitted" }
    | { type: "paymentConfirmed" }
    | { type: "actionRequired"; reason: string }
    | { type: "committeeAllocated"; committee: string; portfolio: string }
    | { type: "waitlisted" };

/** Logs without personal data, so nothing sensitive reaches the server logs. */
const consoleTransport: MailTransport = async (message) => {
    console.info(`[mail:not-sent] ${message.event} for ${message.applicationId}`);
};

function getTransport(): MailTransport {
    return consoleTransport;
}

const SIGN_OFF = `\n\nFor queries, contact us on WhatsApp at ${EVENT_INFO.contact.whatsapp} or by email at ${EVENT_INFO.contact.email}.\nTLC, The Literary Club, FAST-NUCES Karachi`;

function compose(event: MailEvent, name: string, applicationId: string): { subject: string; text: string } {
    const hello = `Dear ${firstName(name)},\n\n`;
    switch (event.type) {
        case "registrationReceived":
            return {
                subject: `Registration received: ${applicationId}`,
                text: `${hello}Thank you. Your registration for The Grand Debate '26 has been received.\n\nYour application ID is ${applicationId}. Please retain it, as it is required to sign in to the portal.\n\nTotal payable: PKR ${event.totalPayable.toLocaleString("en-US")} (${event.rateType} rate).\n\nYour payment will now be reviewed. Once it is confirmed, your committee will be allocated within 1 to 3 business days. You may monitor your progress in the portal at any time.${SIGN_OFF}`,
            };
        case "receiptResubmitted":
            return {
                subject: `New payment screenshot received: ${applicationId}`,
                text: `${hello}We have received your new payment screenshot. Your payment will be reviewed again, and your status will be updated in the portal.${SIGN_OFF}`,
            };
        case "paymentConfirmed":
            return {
                subject: `Payment confirmed: ${applicationId}`,
                text: `${hello}You are confirmed as a delegate. Your committee will be allocated within 1 to 3 business days.${SIGN_OFF}`,
            };
        case "actionRequired":
            return {
                subject: `Action required: ${applicationId}`,
                text: `${hello}We were unable to verify your payment: ${event.reason}. Please sign in to the portal and upload a new screenshot, and your payment will be reviewed again.${SIGN_OFF}`,
            };
        case "committeeAllocated":
            return {
                subject: `Committee allocated: ${event.committee}`,
                text: `${hello}You have been allocated to ${event.committee}, representing ${event.portfolio}. Your study guide is available in the portal and the document archive. Delegates are expected to arrive prepared.${SIGN_OFF}`,
            };
        case "waitlisted":
            return {
                subject: `Waitlist update: ${applicationId}`,
                text: `${hello}Your preferred committee is currently full, and you have been placed on the waitlist. The portal will be updated as soon as a seat becomes available. No further action is required.${SIGN_OFF}`,
            };
    }
}

async function send(event: MailEvent, applicationId: string, to: string, name: string): Promise<void> {
    try {
        await getTransport()({ event: event.type, applicationId, to, ...compose(event, name, applicationId) });
    } catch (error) {
        // A failed email never fails the request that triggered it.
        console.error(`Email ${event.type} for ${applicationId} failed:`, error);
    }
}

/** Emails the solo delegate or head delegate of an application. */
export async function notifyContact(applicationId: string, event: MailEvent): Promise<void> {
    try {
        await connectDB();
        const application = await Application.findOne({ applicationId })
            .select("contactEmail contactName")
            .lean<{ contactEmail?: string; contactName?: string }>();
        let to = application?.contactEmail;
        let name = application?.contactName;
        if (!to) {
            // Applications created before contact fields existed: fall back to the first delegate.
            const delegate = await Delegate.findOne({ applicationId })
                .select("email fullName")
                .lean<{ email: string; fullName: string }>();
            to = delegate?.email;
            name = delegate?.fullName;
        }
        if (to) await send(event, applicationId, to, name ?? "");
    } catch (error) {
        console.error(`Email ${event.type} for ${applicationId} failed:`, error);
    }
}

/** Emails one delegate about their own allocation or waitlist status. */
export async function notifyDelegate(delegateId: string, event: MailEvent): Promise<void> {
    try {
        await connectDB();
        const delegate = await Delegate.findById(delegateId)
            .select("email fullName applicationId")
            .lean<{ email: string; fullName: string; applicationId: string }>();
        if (!delegate) return;
        if (event.type === "committeeAllocated") {
            const committee = await Committee.findOne({ code: event.committee }).select("name").lean<{ name: string }>();
            event = { ...event, committee: committee?.name ?? event.committee };
        }
        await send(event, delegate.applicationId, delegate.email, delegate.fullName);
    } catch (error) {
        console.error(`Email ${event.type} for delegate ${delegateId} failed:`, error);
    }
}
