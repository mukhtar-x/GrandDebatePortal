import { writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import * as nodemailer from "nodemailer";
import connectDB from "@/lib/db";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";

const COMMUNITIES = [
    { code: "UN Women", label: "UNWOMEN", link: "https://chat.whatsapp.com/HQOD3d0lATUEcblgaZlusC?s=cl&p=a&iam=2" },
    { code: "DISEC", label: "DISEC", link: "https://chat.whatsapp.com/Lo1dYcBp4ffBlrAGD2Rj3q?s=cl&p=a&iam=2" },
    { code: "UNSC", label: "UNSC", link: "https://chat.whatsapp.com/Km1JnBJNUz4EgLgUZ4HxPn?s=cl&p=a&iam=2" },
    { code: "PAC", label: "PAC", link: "https://chat.whatsapp.com/JjXbCurjzXmFqX8K0bOQVW?s=cl&p=a&iam=2" },
    { code: "PNA", label: "PNA", link: "https://chat.whatsapp.com/C4fxd46NexVL6XXUB5F8p1?s=cl&p=a&iam=2" },
] as const;

interface Recipient {
    fullName: string;
    email: string;
    assignedCommittee: string;
}

interface ActualTestDelegate extends Recipient {
    applicationId: string;
    assignedPortfolio?: string | null;
    isHead?: boolean;
}

function csvCell(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}

function brandedHtml(
    eyebrow: string,
    heading: string,
    intro: string,
    links: readonly { label: string; url: string }[],
    details: readonly { label: string; value: string }[] = [],
): string {
    const detailRows = details.map(({ label, value }) =>
        `<tr><td style="width:38%;padding:10px 14px;font-size:13px;color:#667085;border:1px solid #eee9df;">${escapeHtml(label)}</td><td style="padding:10px 14px;font-size:14px;font-weight:bold;color:#0b1b31;border:1px solid #eee9df;">${escapeHtml(value)}</td></tr>`,
    ).join("");
    const linkRows = links.map(({ label, url }) =>
        `<tr><td style="padding:12px 14px;border:1px solid #eee9df;"><a href="${escapeHtml(url)}" style="color:#0b1b31;font-weight:bold;text-decoration:underline;">Join ${escapeHtml(label)}</a></td></tr>`,
    ).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f5f1e8;font-family:Arial,Helvetica,sans-serif;color:#14253d;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e8;"><tr><td align="center" style="padding:32px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid #e7dfd0;border-radius:12px;overflow:hidden;"><tr><td style="height:8px;background:#c5a15a;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:28px 30px 8px;"><div style="font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#c5a15a;">TLC · FAST-NUCES Karachi</div><div style="margin-top:8px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:bold;color:#0b1b31;">The Grand Debate '26</div></td></tr><tr><td style="padding:16px 30px 30px;font-size:15px;line-height:1.65;color:#14253d;"><div style="display:inline-block;margin-bottom:14px;padding:5px 10px;border-radius:20px;background:#f5f1e8;color:#80652d;font-size:12px;font-weight:bold;letter-spacing:.5px;">${escapeHtml(eyebrow)}</div><h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;color:#0b1b31;">${escapeHtml(heading)}</h1><p style="margin:0 0 18px;">${escapeHtml(intro)}</p>${details.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;">${detailRows}</table>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linkRows}</table><p style="margin:22px 0 0;font-size:13px;color:#667085;">The Literary Club (TLC) · FAST-NUCES Karachi</p></td></tr></table></td></tr></table></body></html>`;
}

function getOptions(args: string[]) {
    const send = args.includes("--send");
    const testIndex = args.indexOf("--test-to");
    const testTo = testIndex >= 0 ? args[testIndex + 1] : undefined;
    const actualIndex = args.indexOf("--test-from-db");
    const actualTo = actualIndex >= 0 ? args[actualIndex + 1] : undefined;
    const onlyIndex = args.indexOf("--only");
    const onlyType = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
    const outputIndex = args.indexOf("--output");
    const output = outputIndex >= 0 ? args[outputIndex + 1] : "community-whatsapp-recipients.csv";
    if (outputIndex >= 0 && (!output || output.startsWith("--"))) {
        throw new Error("Pass a file path after --output.");
    }
    const unknown = args.filter((arg, index) =>
        arg.startsWith("--") && arg !== "--send" && arg !== "--output" && arg !== "--test-to" && arg !== "--test-from-db" && arg !== "--only" && args[index - 1] !== "--output" && args[index - 1] !== "--test-to" && args[index - 1] !== "--test-from-db" && args[index - 1] !== "--only",
    );
    if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
    if (testIndex >= 0 && (!testTo || testTo.startsWith("--"))) throw new Error("Pass an email address after --test-to.");
    if (actualIndex >= 0 && (!actualTo || actualTo.startsWith("--"))) throw new Error("Pass an email address after --test-from-db.");
    if (testTo && actualTo) throw new Error("Choose either --test-to or --test-from-db.");
    if (onlyIndex >= 0 && onlyType !== "delegation" && onlyType !== "solo") throw new Error("--only must be delegation or solo.");
    if (onlyType && !actualTo) throw new Error("--only can only be used with --test-from-db.");
    return { send, output, testTo, actualTo, onlyType: onlyType as "delegation" | "solo" | undefined };
}

function makeMessage(recipient: Recipient) {
    const community = COMMUNITIES.find((item) => item.code.toLowerCase() === recipient.assignedCommittee.trim().toLowerCase());
    if (!community) return null;
    const subject = `Join the ${community.label} WhatsApp community | The Grand Debate '26`;
    const text = [
        `Hi ${recipient.fullName || "Delegate"},`,
        "",
        `You are receiving this because you have been assigned to the ${community.label} committee at The Grand Debate '26. Join your committee's WhatsApp community using this link:`,
        "",
        community.link,
        "",
        "Please use the group to stay up to date with committee announcements. We look forward to seeing you at the conference!",
        "",
        "The Literary Club (TLC) · FAST-NUCES Karachi",
    ].join("\n");
    const html = brandedHtml(
        "Committee community",
        `Join the ${community.label} WhatsApp community.`,
        `Dear ${recipient.fullName || "Delegate"}, you are receiving this because you have been assigned to the ${community.label} committee at The Grand Debate '26. Join your committee's community using the link below.`,
        [{ label: `${community.label} WhatsApp group`, url: community.link }],
    );
    return { subject, text, html };
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function createTransporter() {
    const user = process.env.GOOGLE_SMTP_USER?.trim();
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
    if (!user || !clientId || !clientSecret || !refreshToken) {
        throw new Error("Sending requires GOOGLE_SMTP_USER, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.");
    }
    const port = Number(process.env.GOOGLE_SMTP_PORT || 465);
    if (![465, 587].includes(port)) throw new Error("GOOGLE_SMTP_PORT must be 465 or 587.");
    const transporter = nodemailer.createTransport({
        host: process.env.GOOGLE_SMTP_HOST?.trim() || "smtp.gmail.com",
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { type: "OAuth2", user, clientId, clientSecret, refreshToken },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });
    return { transporter, from: process.env.GOOGLE_SMTP_FROM?.trim() || user };
}

async function sendTestEmail(to: string) {
    const { transporter, from } = createTransporter();
    const textLinks = COMMUNITIES.map((community) => `${community.label}: ${community.link}`).join("\n");
    try {
        await transporter.sendMail({
            from: { name: "The Grand Debate '26", address: from },
            replyTo: "tlc.khi@nu.edu.pk",
            to,
            subject: "TEST: The Grand Debate '26 WhatsApp community links",
            text: `This is a test email.\n\n${textLinks}\n\nThe Literary Club (TLC) · FAST-NUCES Karachi`,
            html: brandedHtml(
                "Test email",
                "WhatsApp community links",
                "This test checks the branded email layout and the five committee links.",
                COMMUNITIES.map((community) => ({ label: community.label, url: community.link })),
            ),
        });
        console.info(`[test sent] ${to}`);
    } finally {
        await transporter.close();
    }
}

async function findActualDelegates(participantType: "delegation" | "solo"): Promise<{
    delegates: ActualTestDelegate[];
    institution?: string;
    delegateCount?: number;
} | null> {
    const applications = await Application.find({ participantType })
        .sort({ updatedAt: -1 })
        .limit(100)
        .select("applicationId participantType institution delegateCount")
        .lean();
    if (!applications.length) return null;

    const applicationIds = applications.map((application) => application.applicationId);
    const candidates = await Delegate.find({
        applicationId: { $in: applicationIds },
    })
        .sort({ createdAt: 1 })
        .select("applicationId fullName email assignedCommittee assignedPortfolio isHead createdAt")
        .lean<ActualTestDelegate[]>();
    const byApplication = new Map<string, ActualTestDelegate[]>();
    for (const candidate of candidates) {
        const bucket = byApplication.get(candidate.applicationId) ?? [];
        bucket.push(candidate);
        byApplication.set(candidate.applicationId, bucket);
    }

    for (const application of applications) {
        const delegates = byApplication.get(application.applicationId) ?? [];
        const hasAssignedCommittee = delegates.some((delegate) =>
            COMMUNITIES.some((community) => community.code.toLowerCase() === delegate.assignedCommittee?.trim().toLowerCase()),
        );
        if (hasAssignedCommittee && delegates.length) {
            return { delegates, institution: application.institution, delegateCount: application.delegateCount };
        }
    }
    return null;
}

async function sendActualDataTests(to: string, onlyType?: "delegation" | "solo") {
    await connectDB({ skipCommitteeSeed: true });
    const { transporter, from } = createTransporter();
    let sent = 0;
    try {
        const participantTypes = onlyType ? [onlyType] : ["delegation", "solo"] as const;
        for (const participantType of participantTypes) {
            const record = await findActualDelegates(participantType);
            if (!record) throw new Error(`No ${participantType} delegate with an assigned committee was found in the database.`);
            const delegates = participantType === "delegation"
                ? record.delegates
                : [record.delegates[0]];
            for (const delegate of delegates) {
                const message = makeMessage(delegate);
                if (!message) continue;
                await transporter.sendMail({
                    from: { name: "The Grand Debate '26", address: from },
                    replyTo: "tlc.khi@nu.edu.pk",
                    to,
                    ...message,
                });
                sent += 1;
            }
            console.info(`[test sent] ${participantType} actual-format email(s): ${delegates.length} delegate(s), routed only to the designated test address`);
        }
    } finally {
        await transporter.close();
    }
    console.info(`Actual-format test complete: ${sent} emails sent to the designated test address.`);
}

async function main() {
    const { send, output, testTo, actualTo, onlyType } = getOptions(process.argv.slice(2));
    if (actualTo) {
        if (!send) throw new Error("Actual-data test delivery requires --send.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actualTo)) throw new Error("Pass a valid email address after --test-from-db.");
        await sendActualDataTests(actualTo.trim().toLowerCase(), onlyType);
        return;
    }
    if (testTo) {
        if (!send) throw new Error("Test delivery is an external send; add --send to confirm the test recipient.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) throw new Error("Pass a valid email address after --test-to.");
        await sendTestEmail(testTo.trim().toLowerCase());
        return;
    }
    await connectDB({ skipCommitteeSeed: true });

    const codes = COMMUNITIES.map((community) => community.code);
    const recipients = await Delegate.find({
        assignedCommittee: { $in: codes },
        email: { $type: "string", $ne: "" },
    })
        .select("fullName email assignedCommittee")
        .lean<Recipient[]>();

    const normalized = new Map<string, Recipient>();
    for (const recipient of recipients) {
        const email = recipient.email.trim().toLowerCase();
        if (email && !normalized.has(email)) normalized.set(email, { ...recipient, email });
    }
    const uniqueRecipients = [...normalized.values()];
    const csv = [
        ["name", "email", "committee"].join(","),
        ...uniqueRecipients.map((recipient) => [recipient.fullName, recipient.email, recipient.assignedCommittee]
            .map((value) => csvCell(value ?? "")).join(",")),
    ].join("\n") + "\n";
    await writeFile(output, csv, { encoding: "utf8", mode: 0o600 });

    const counts = new Map<string, number>();
    for (const recipient of uniqueRecipients) {
        counts.set(recipient.assignedCommittee, (counts.get(recipient.assignedCommittee) ?? 0) + 1);
    }
    console.info(`Exported ${uniqueRecipients.length} unique recipients to ${output}.`);
    for (const community of COMMUNITIES) {
        console.info(`${community.label}: ${counts.get(community.code) ?? 0} recipients`);
    }

    if (!send) {
        console.info("Dry run only. Review the CSV, then rerun with --send to deliver the emails.");
        return;
    }

    const { transporter, from } = createTransporter();
    let sent = 0;
    let failed = 0;
    for (const recipient of uniqueRecipients) {
        const message = makeMessage(recipient);
        if (!message) continue;
        try {
            await transporter.sendMail({
                from: { name: "The Grand Debate '26", address: from },
                replyTo: "tlc.khi@nu.edu.pk",
                to: recipient.email,
                ...message,
            });
            sent += 1;
            console.info(`[sent] ${recipient.email} (${recipient.assignedCommittee})`);
        } catch (error) {
            failed += 1;
            const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
            console.error(`[failed] ${recipient.email} (${code})`);
        }
    }
    await transporter.close();
    console.info(`Email run complete: ${sent} sent, ${failed} failed.`);
    if (failed) process.exitCode = 1;
}

main()
    .catch((error: unknown) => {
        console.error("Could not complete the community email run.", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
