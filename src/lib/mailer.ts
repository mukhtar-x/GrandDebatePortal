import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { randomUUID } from "node:crypto";
import connectDB from "@/lib/db";
import { firstName } from "@/lib/validation";
import { EVENT_DETAILS as EVENT } from "@/data/event";
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

const BRAND = EVENT.name;
const INK = "#14253d";
const NAVY = "#0b1b31";
const GOLD = "#c5a15a";
const GOLD_DARK = "#80652d";
const SAND = "#f5f1e8";
const PANEL = "#f8f6f1";
const LINE = "#eee9df";
const MUTED = "#667085";
const WARN_BG = "#fdf3e7";
const WARN_LINE = "#d9822b";
const CONTACT = "WhatsApp: 0314 3552058 · Email: tlc.khi@nu.edu.pk";
const SIGN_OFF = `Questions? ${CONTACT}\n\nTLC · The Literary Club · FAST-NUCES Karachi`;

/* ------------------------------------------------------------------ */
/* Content model: every email is a list of blocks rendered to HTML and */
/* plain text from the same source.                                    */
/* ------------------------------------------------------------------ */

type Row = { label: string; value: string };

type Block =
    | { kind: "p"; text: string }
    /** Highlighted values shown side by side in one row (for example committee and portfolio). */
    | { kind: "facts"; title?: string; items: Row[] }
    /** Label/value rows in a single bordered table. */
    | { kind: "table"; title?: string; rows: Row[] }
    /** Numbered list. */
    | { kind: "steps"; title: string; items: string[] }
    /** Boxed note. "warn" uses an amber accent. */
    | { kind: "callout"; tone: "info" | "warn"; title: string; text: string };

interface EmailContent {
    subject: string;
    eyebrow: string;
    heading: string;
    intro: string;
    blocks: Block[];
    ctaLabel: string;
}

const EVENT_DETAILS: Block = {
    kind: "table",
    title: "Event details",
    rows: [
        { label: "Dates", value: EVENT.dates },
        { label: "Daily timings", value: EVENT.dailyHours },
        { label: "Venue", value: EVENT.venue },
    ],
};

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

function siteUrl(): string | undefined {
    return process.env.TGD_SITE_URL?.trim().replace(/\/$/, "") || undefined;
}

/* ------------------------------ HTML ------------------------------ */

function sectionTitle(title?: string): string {
    if (!title) return "";
    return `<div style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD_DARK};">${escapeHtml(title)}</div>`;
}

function renderBlockHtml(block: Block): string {
    switch (block.kind) {
        case "p":
            return `<p style="margin:0 0 16px;">${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;

        case "facts": {
            const cells = block.items
                .map(
                    (item) =>
                        `<td valign="top" style="width:${Math.floor(100 / block.items.length)}%;padding:14px 16px;background:${PANEL};border-left:3px solid ${GOLD};"><div style="font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(item.label)}</div><div style="margin-top:4px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.35;font-weight:bold;color:${NAVY};">${escapeHtml(item.value)}</div></td>`,
                )
                .join(`<td style="width:10px;font-size:0;line-height:0;">&nbsp;</td>`);
            return `<div style="margin:0 0 22px;">${sectionTitle(block.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table></div>`;
        }

        case "table": {
            const rows = block.rows
                .map(
                    (row, index) =>
                        `<tr><td valign="top" style="width:38%;padding:10px 14px;font-size:13px;color:${MUTED};${index > 0 ? `border-top:1px solid ${LINE};` : ""}">${escapeHtml(row.label)}</td><td valign="top" style="padding:10px 14px;font-size:14px;font-weight:bold;color:${NAVY};${index > 0 ? `border-top:1px solid ${LINE};` : ""}">${escapeHtml(row.value)}</td></tr>`,
                )
                .join("");
            return `<div style="margin:0 0 22px;">${sectionTitle(block.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;">${rows}</table></div>`;
        }

        case "steps": {
            const items = block.items
                .map(
                    (item, index) =>
                        `<tr><td valign="top" style="width:30px;padding:6px 0;"><div style="width:22px;height:22px;border-radius:11px;background:${NAVY};color:#ffffff;font-size:12px;font-weight:bold;line-height:22px;text-align:center;">${index + 1}</div></td><td valign="top" style="padding:6px 0 6px 6px;font-size:14px;line-height:1.55;color:${INK};">${escapeHtml(item)}</td></tr>`,
                )
                .join("");
            return `<div style="margin:0 0 22px;">${sectionTitle(block.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></div>`;
        }

        case "callout": {
            const warn = block.tone === "warn";
            return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td style="padding:14px 16px;background:${warn ? WARN_BG : PANEL};border-left:3px solid ${warn ? WARN_LINE : GOLD};"><div style="font-size:13px;font-weight:bold;color:${warn ? "#8a4a0f" : NAVY};">${escapeHtml(block.title)}</div><div style="margin-top:4px;font-size:14px;line-height:1.55;color:${INK};">${escapeHtml(block.text).replace(/\n/g, "<br>")}</div></td></tr></table>`;
        }
    }
}

function renderHtml(content: EmailContent, greeting: string, applicationId: string): string {
    const { subject, eyebrow, heading, intro, blocks, ctaLabel } = content;
    const base = siteUrl();
    const cta = base
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px;"><tr><td align="center" bgcolor="${NAVY}" style="border-radius:4px;"><a href="${escapeHtml(`${base}/portal`)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">${escapeHtml(ctaLabel)}</a></td></tr></table>`
        : "";

    // Table layout and inline styles keep the message readable in Gmail, Outlook, and mobile clients.
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${BRAND}</title></head>
<body style="margin:0;padding:0;background:${SAND};font-family:Arial,Helvetica,sans-serif;color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(subject)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SAND};"><tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;">
      <tr><td style="height:8px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:28px 30px 8px;">
        <div style="font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${GOLD};">TLC · FAST-NUCES Karachi</div>
        <div style="margin-top:8px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:bold;color:${NAVY};">${BRAND}</div>
      </td></tr>
      <tr><td style="padding:16px 30px 8px;font-size:15px;line-height:1.65;color:${INK};">
        <div style="display:inline-block;margin-bottom:14px;padding:5px 10px;border-radius:20px;background:${SAND};color:${GOLD_DARK};font-size:12px;font-weight:bold;letter-spacing:.5px;">${escapeHtml(eyebrow)}</div>
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;color:${NAVY};">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 22px;">${escapeHtml(intro)}</p>
        ${blocks.map(renderBlockHtml).join("")}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:${PANEL};border-left:3px solid ${GOLD};"><tr><td style="padding:12px 16px;font-size:13px;color:${MUTED};">Application ID<br><strong style="display:inline-block;margin-top:3px;font-size:18px;letter-spacing:1px;color:${NAVY};">${escapeHtml(applicationId)}</strong></td></tr></table>
        ${cta}
      </td></tr>
      <tr><td style="padding:22px 30px 24px;font-size:12px;line-height:1.6;color:${MUTED};">
        <div style="border-top:1px solid ${LINE};padding-top:16px;">Questions? ${CONTACT}<br>TLC · The Literary Club · FAST-NUCES Karachi</div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/* ---------------------------- Plain text ---------------------------- */

function renderBlockText(block: Block): string {
    switch (block.kind) {
        case "p":
            return block.text;
        case "facts":
            return `${block.title ? `${block.title.toUpperCase()}\n` : ""}${block.items.map((item) => `${item.label}: ${item.value}`).join("\n")}`;
        case "table":
            return `${block.title ? `${block.title.toUpperCase()}\n` : ""}${block.rows.map((row) => `${row.label}: ${row.value}`).join("\n")}`;
        case "steps":
            return `${block.title.toUpperCase()}\n${block.items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
        case "callout":
            return `${block.title.toUpperCase()}\n${block.text}`;
    }
}

/* ------------------------- Email definitions ------------------------ */

function describe(event: MailEvent, applicationId: string): EmailContent {
    switch (event.type) {
        case "registrationReceived": {
            const solo = event.participantType === "solo";
            const perDelegate = Math.round(event.totalPayable / Math.max(event.delegateCount, 1));
            return {
                subject: `Registration received: ${applicationId}`,
                eyebrow: "Registration received",
                heading: "We’ve received your registration.",
                intro: "Thank you for registering for The Grand Debate '26. Here is a summary of what you submitted.",
                blocks: [
                    {
                        kind: "table",
                        title: "Registration summary",
                        rows: [
                            { label: "Registration type", value: solo ? "Solo delegate" : "Delegation" },
                            { label: "Delegates", value: String(event.delegateCount) },
                            { label: "Rate applied", value: event.rateType },
                            { label: "Fee per delegate", value: `PKR ${perDelegate.toLocaleString("en-US")}` },
                            { label: "Total payable", value: `PKR ${event.totalPayable.toLocaleString("en-US")}` },
                            { label: "Status", value: "Payment under review" },
                        ],
                    },
                    {
                        kind: "steps",
                        title: "What happens next",
                        items: [
                            "Our team reviews your payment receipt.",
                            "You receive an email once your payment is confirmed. If the receipt is unclear, we will ask you to upload a new one.",
                            "After your payment is confirmed, your committee and portfolio are allocated ahead of the event, and you are emailed your assignment.",
                        ],
                    },
                    {
                        kind: "callout",
                        tone: "info",
                        title: "Keep your application ID",
                        text: "You need your application ID and the email address you registered with to check your status in the portal.",
                    },
                    EVENT_DETAILS,
                ],
                ctaLabel: "Track your application",
            };
        }

        case "receiptResubmitted":
            return {
                subject: `New payment receipt received: ${applicationId}`,
                eyebrow: "Receipt received",
                heading: "We have your updated receipt.",
                intro: "Thank you. Your new payment receipt has been received and added to your application.",
                blocks: [
                    {
                        kind: "table",
                        title: "Current status",
                        rows: [
                            { label: "Receipt", value: "Received" },
                            { label: "Status", value: "Payment under review" },
                        ],
                    },
                    {
                        kind: "steps",
                        title: "What happens next",
                        items: [
                            "Our team reviews the new receipt.",
                            "Your application status updates in the portal.",
                            "We email you once the payment is confirmed, or if anything else is needed.",
                        ],
                    },
                    {
                        kind: "callout",
                        tone: "info",
                        title: "No further action needed",
                        text: "You do not need to upload the receipt again unless we contact you.",
                    },
                ],
                ctaLabel: "Check your status",
            };

        case "paymentConfirmed":
            return {
                subject: `Payment confirmed: ${applicationId}`,
                eyebrow: "Payment confirmed",
                heading: "You are confirmed as a delegate.",
                intro: "Your payment has been confirmed and your place at The Grand Debate '26 is secured.",
                blocks: [
                    {
                        kind: "table",
                        title: "Current status",
                        rows: [
                            { label: "Payment", value: "Confirmed" },
                            { label: "Committee allocation", value: "Before the event" },
                        ],
                    },
                    {
                        kind: "steps",
                        title: "What happens next",
                        items: [
                            "Your committee and country or portfolio are allocated ahead of the event.",
                            "Each delegate receives an email with their own assignment.",
                            "You can follow your application at any time in the portal. For delegations, the head delegate can see every delegate's committee, portfolio and status.",
                        ],
                    },
                    EVENT_DETAILS,
                ],
                ctaLabel: "Open application portal",
            };

        case "actionRequired":
            return {
                subject: `Action required: ${applicationId}`,
                eyebrow: "Action required",
                heading: "Please update your payment receipt.",
                intro: "We could not verify your payment, so your application is on hold until we receive a corrected receipt.",
                blocks: [
                    {
                        kind: "callout",
                        tone: "warn",
                        title: "Reason",
                        text: event.reason,
                    },
                    {
                        kind: "steps",
                        title: "How to fix it",
                        items: [
                            "Open the application portal.",
                            "Sign in with your registration email and application ID.",
                            "Upload a clear, complete receipt as an image or PDF, with the amount, date and reference visible.",
                        ],
                    },
                    {
                        kind: "table",
                        title: "Current status",
                        rows: [
                            { label: "Status", value: "Action required" },
                            { label: "Needed from you", value: "New payment receipt" },
                        ],
                    },
                ],
                ctaLabel: "Upload new receipt",
            };

        case "committeeAllocated":
            return {
                subject: `Committee allocated: ${event.committee}`,
                eyebrow: "Committee allocated",
                heading: "Your committee assignment is ready.",
                intro: "Your allocation for The Grand Debate '26 is confirmed. Here is where you will be debating.",
                blocks: [
                    {
                        kind: "facts",
                        title: "Your assignment",
                        items: [
                            { label: "Committee", value: event.committee },
                            { label: "Portfolio", value: event.portfolio },
                        ],
                    },
                    EVENT_DETAILS,
                    {
                        kind: "steps",
                        title: "Next steps",
                        items: [
                            "Review your assignment details and preparation information in the portal.",
                            "Research your portfolio and your committee's agenda as it is announced.",
                            "Use the study guides and resources as they are released.",
                        ],
                    },
                ],
                ctaLabel: "View assignment details",
            };

        case "waitlisted":
            return {
                subject: `Waitlist update: ${applicationId}`,
                eyebrow: "Waitlist update",
                heading: "You have been placed on the waitlist.",
                intro: "A seat is not currently available for your assignment, so your application has been added to the waitlist.",
                blocks: [
                    {
                        kind: "table",
                        title: "Current status",
                        rows: [
                            { label: "Status", value: "Waitlisted" },
                            { label: "Payment", value: "Received and on record" },
                        ],
                    },
                    {
                        kind: "steps",
                        title: "What happens next",
                        items: [
                            "Your status is recorded in the portal.",
                            "If a place opens, the organisers will update your application and email you.",
                            "No action is needed from you in the meantime.",
                        ],
                    },
                ],
                ctaLabel: "Check your status",
            };
    }
}

function compose(event: MailEvent, name: string, applicationId: string): { subject: string; text: string; html: string } {
    const content = describe(event, applicationId);
    const greeting = `Dear ${firstName(name)},`;

    const base = siteUrl();
    const portalLine = base ? `\n\n${content.ctaLabel}: ${base}/portal` : "";
    const text = [
        greeting,
        content.intro,
        ...content.blocks.map(renderBlockText),
        `Application ID: ${applicationId}${portalLine}`,
        SIGN_OFF,
    ].join("\n\n");

    return { subject: content.subject, text, html: renderHtml(content, greeting, applicationId) };
}

/* ------------------------------ Sending ----------------------------- */

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
