import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { randomUUID } from "node:crypto";
import connectDB from "@/lib/db";
import { firstName } from "@/lib/validation";
import Application from "@/models/Application";
import Committee from "@/models/Committee";
import Delegate from "@/models/Delegate";

export interface MailMessage {
    event: MailEvent["type"];
    applicationId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
}

export type MailEvent =
    | {
          type: "registrationReceived";
          totalPayable: number;
          rateType: string;
          participantType: "solo" | "delegation";
          delegateCount: number;
      }
    | { type: "receiptResubmitted" }
    | { type: "paymentConfirmed" }
    | { type: "actionRequired"; reason: string }
    | { type: "committeeAllocated"; committee: string; portfolio: string }
    | { type: "waitlisted" };

const BRAND = "The Grand Debate '26";
const INK = "#14253d";
const NAVY = "#0b1b31";
const GOLD = "#c5a15a";
const SAND = "#f5f1e8";
const MUTED = "#667085";
const CONTACT = "WhatsApp: 0314 3552058 · Email: tlc.khi@nu.edu.pk";
const SIGN_OFF = `Questions? ${CONTACT}\n\nTLC · The Literary Club · FAST-NUCES Karachi`;

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
    if (transporter) return transporter;

    const user = process.env.GOOGLE_SMTP_USER?.trim();
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
    if (!user || !clientId || !clientSecret || !refreshToken) return null;

    const port = Number(process.env.GOOGLE_SMTP_PORT || 465);
    if (![465, 587].includes(port)) {
        throw new Error("GOOGLE_SMTP_PORT must be 465 (SSL) or 587 (STARTTLS).");
    }

    transporter = nodemailer.createTransport({
        host: process.env.GOOGLE_SMTP_HOST?.trim() || "smtp.gmail.com",
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: {
            type: "OAuth2",
            user,
            clientId,
            clientSecret,
            refreshToken,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });
    return transporter;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        };
        return entities[character];
    });
}

function renderHtml(input: { preheader: string; eyebrow: string; heading: string; body: string; applicationId: string }): string {
    const { preheader, eyebrow, heading, body, applicationId } = input;
    const safeBody = body.split("\n\n").map((paragraph) =>
        `<p style="margin:0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    ).join("");
    const configuredPortalUrl = process.env.TGD_SITE_URL?.trim().replace(/\/$/, "");
    const portalLink = configuredPortalUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${NAVY}" style="border-radius:4px;"><a href="${escapeHtml(`${configuredPortalUrl}/portal`)}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">Open application portal</a></td></tr></table>`
        : "";

    // Table layout and inline styles keep the message readable in Gmail, Outlook, and mobile clients.
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:${SAND};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};"><tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;">
      <tr><td style="height:8px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 30px 8px;">
        <div style="font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${GOLD};">TLC · FAST-NUCES Karachi</div>
        <div style="margin-top:8px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:bold;color:${NAVY};">${BRAND}</div>
      </td></tr>
      <tr><td style="padding:16px 30px 30px;font-size:15px;line-height:1.65;color:${INK};">
        <div style="display:inline-block;margin-bottom:14px;padding:5px 10px;border-radius:20px;background:#f5f1e8;color:#80652d;font-size:12px;font-weight:bold;letter-spacing:.5px;">${escapeHtml(eyebrow)}</div>
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;color:${NAVY};">${escapeHtml(heading)}</h1>
        ${safeBody}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 22px;background:#f8f6f1;border-left:3px solid ${GOLD};"><tr><td style="padding:12px 15px;font-size:13px;color:${MUTED};">Application ID<br><strong style="display:inline-block;margin-top:3px;font-size:17px;letter-spacing:1px;color:${NAVY};">${escapeHtml(applicationId)}</strong></td></tr></table>
        ${portalLink}
      </td></tr>
      <tr><td style="padding:18px 30px 24px;border-top:1px solid #eee9df;font-size:12px;line-height:1.6;color:${MUTED};">${CONTACT}<br>TLC · The Literary Club · FAST-NUCES Karachi</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function compose(event: MailEvent, name: string, applicationId: string): { subject: string; text: string; html: string } {
    const hello = `Dear ${firstName(name)},\n\n`;
    let subject: string;
    let eyebrow: string;
    let heading: string;
    let body: string;
    switch (event.type) {
        case "registrationReceived":
            subject = `Registration received: ${applicationId}`;
            eyebrow = "Registration received";
            heading = "We’ve received your registration.";
            body = `Thank you for registering for The Grand Debate '26.\n\nRegistration type: ${event.participantType === "solo" ? "Solo delegate" : `Delegation (${event.delegateCount} delegates)`}.\nTotal payable: PKR ${event.totalPayable.toLocaleString("en-US")} (${event.rateType} rate).\n\nYour payment receipt is now under review. After payment confirmation, committee allocation follows within 1 to 3 business days.\n\nKeep this application ID and use it with your registration email to check your status in the portal.`;
            break;
        case "receiptResubmitted":
            subject = `New payment receipt received: ${applicationId}`;
            eyebrow = "Receipt received";
            heading = "We have your updated receipt.";
            body = "Your new payment receipt has been received. The payment will be reviewed again, and your application status will update in the portal.";
            break;
        case "paymentConfirmed":
            subject = `Payment confirmed: ${applicationId}`;
            eyebrow = "Payment confirmed";
            heading = "You are confirmed as a delegate.";
            body = "Your payment has been confirmed. Your committee will be allocated within 1 to 3 business days. You can follow your application in the portal.";
            break;
        case "actionRequired":
            subject = `Action required: ${applicationId}`;
            eyebrow = "Action required";
            heading = "Please update your payment receipt.";
            body = `We could not verify your payment: ${event.reason}\n\nSign in to the portal and upload a clearer or corrected receipt so the review can continue.`;
            break;
        case "committeeAllocated":
            subject = `Committee allocated: ${event.committee}`;
            eyebrow = "Committee allocated";
            heading = "Your committee assignment is ready.";
            body = `You have been allocated to ${event.committee}, representing ${event.portfolio}. Check the portal for your assignment details and preparation information.`;
            break;
        case "waitlisted":
            subject = `Waitlist update: ${applicationId}`;
            eyebrow = "Waitlist update";
            heading = "You have been placed on the waitlist.";
            body = "A seat is not currently available for your assignment. Your status is recorded in the portal, and the organisers will update it if a place opens.";
            break;
    }
    const configuredSiteUrl = process.env.TGD_SITE_URL?.trim().replace(/\/$/, "");
    const portalLine = configuredSiteUrl ? `\nApplication portal: ${configuredSiteUrl}/portal` : "";
    const text = `${hello}${body}\n\nApplication ID: ${applicationId}${portalLine}\n\n${SIGN_OFF}`;
    const html = renderHtml({ preheader: subject, eyebrow, heading, body: `${hello}${body}`, applicationId });
    return { subject, text, html };
}

async function send(event: MailEvent, applicationId: string, to: string, name: string): Promise<boolean> {
    try {
        const mailTransport = getTransporter();
        if (!mailTransport) {
            console.warn(`[mail:not-configured] ${event.type} for ${applicationId}`);
            return false;
        }

        const from = process.env.GOOGLE_SMTP_FROM?.trim() || process.env.GOOGLE_SMTP_USER!.trim();
        const message = compose(event, name, applicationId);
        await mailTransport.sendMail({
            from: { name: BRAND, address: from! },
            to,
            replyTo: "tlc.khi@nu.edu.pk",
            ...message,
        });
        console.info(`[mail:sent] ${event.type} for ${applicationId}`);
        return true;
    } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
        console.error(`[mail:failed] ${event.type} for ${applicationId} (${code})`);
        return false;
    }
}

const SMOKE_TEST_RECIPIENTS = new Set(["ismailsilat7@gmail.com", "k240546@nu.edu.pk"]);

/** Sends synthetic registration messages without reading or writing application records. */
export async function sendRegistrationSmokeTest(
    recipient: string,
    participantType: "solo" | "delegation",
): Promise<boolean> {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Email smoke tests are disabled in production.");
    }
    const to = recipient.trim().toLowerCase();
    if (!SMOKE_TEST_RECIPIENTS.has(to)) {
        throw new Error("Smoke-test recipient is not on the approved test-recipient list.");
    }
    const delegateCount = participantType === "solo" ? 1 : 4;
    const applicationId = `TGD-TEST-${participantType.toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const event: MailEvent = {
        type: "registrationReceived",
        totalPayable: delegateCount * 2000,
        rateType: "Early bird",
        participantType,
        delegateCount,
    };
    const name = participantType === "solo" ? "Sample Solo Delegate" : "Sample Delegation Lead";
    return send(event, applicationId, to, name);
}

/** Sends to the solo delegate or the head delegate of a delegation. */
export async function notifyContact(applicationId: string, event: MailEvent): Promise<void> {
    try {
        await connectDB();
        const application = await Application.findOne({ applicationId })
            .select("contactEmail contactName")
            .lean<{ contactEmail?: string; contactName?: string }>();
        let to = application?.contactEmail;
        let name = application?.contactName;
        if (!to) {
            const delegate = await Delegate.findOne({ applicationId })
                .select("email fullName")
                .lean<{ email: string; fullName: string }>();
            to = delegate?.email;
            name = delegate?.fullName;
        }
        if (to) await send(event, applicationId, to, name ?? "");
    } catch (error) {
        console.error(`Email ${event.type} for ${applicationId} could not be prepared:`, error);
    }
}

/** Sends one delegate their own committee allocation or waitlist update. */
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
        console.error(`Email ${event.type} for delegate ${delegateId} could not be prepared:`, error);
    }
}
