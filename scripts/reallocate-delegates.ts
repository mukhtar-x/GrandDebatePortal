import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mongoose, { type ClientSession } from "mongoose";
import type { IApplication } from "../src/models/Application";
import type { IDelegate } from "../src/models/Delegate";
import type { IPayment } from "../src/models/Payment";

interface Target {
    applicationId: string;
    email: string;
    fullName: string;
    firstPreference: string;
    newCommittee: string;
    newPortfolio: string;
}

interface PlannedChange {
    delegateId: mongoose.Types.ObjectId;
    applicationId: string;
    email: string;
    fullName: string;
    previousCommittee: string;
    previousPortfolio: string;
    committeeCode: string;
    committeeName: string;
    portfolio: string;
    firstPreference: string;
    delegateStatus: string;
}

interface PreparedPlan {
    changes: PlannedChange[];
    unchanged: Array<{ applicationId: string; email: string; committee: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTargets(value: unknown): Target[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error("Target JSON must be a non-empty array of delegate records.");
    }

    const targets = value.map((entry, index): Target => {
        if (!isRecord(entry)) throw new Error(`Target record ${index + 1} must be an object.`);
        const applicationId = nonEmptyString(entry.application_id)?.toUpperCase();
        const email = nonEmptyString(entry.email)?.toLowerCase();
        const fullName = nonEmptyString(entry.full_name);
        const firstPreference = nonEmptyString(entry.first_preference);
        const newCommittee = nonEmptyString(entry.allocated_committee);
        const newPortfolio = nonEmptyString(entry.allotment);

        if (!applicationId || applicationId.length > 100) {
            throw new Error(`Target record ${index + 1} requires application_id.`);
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error(`Target record ${index + 1} requires a valid email.`);
        }
        if (!fullName) {
            throw new Error(`Target record ${index + 1} requires full_name for identity verification.`);
        }
        if (!firstPreference) {
            throw new Error(`Target record ${index + 1} requires first_preference for verification.`);
        }
        if (!newCommittee || newCommittee.length > 100) {
            throw new Error(`Target record ${index + 1} requires allocated_committee.`);
        }
        if (!newPortfolio || newPortfolio.length > 100) {
            throw new Error(`Target record ${index + 1} requires allotment of at most 100 characters.`);
        }
        return { applicationId, email, fullName, firstPreference, newCommittee, newPortfolio };
    });

    const keys = targets.map(({ applicationId, email }) => `${applicationId}\0${email}`);
    if (new Set(keys).size !== keys.length) {
        throw new Error("The targets array contains a duplicate applicationId/email pair.");
    }
    return targets;
}

async function preparePlan(
    targets: Target[],
    session: ClientSession | null,
    lockCommittees: boolean,
    models: {
        Application: typeof import("../src/models/Application").default;
        Committee: typeof import("../src/models/Committee").default;
        Delegate: typeof import("../src/models/Delegate").default;
        Payment: typeof import("../src/models/Payment").default;
    },
): Promise<PreparedPlan> {
    const { Application, Committee, Delegate, Payment } = models;
    const withSession = <T extends { session: (value: ClientSession | null) => T }>(query: T) =>
        query.session(session);

    const delegateMatches = await Promise.all(
        targets.map((target) =>
            withSession(Delegate.find({
                applicationId: target.applicationId,
                email: target.email,
            }).select("_id applicationId email fullName firstPreference assignedCommittee assignedPortfolio delegateStatus")),
        ),
    );
    const unmatched = targets.filter((_, index) => delegateMatches[index].length !== 1);
    if (unmatched.length) {
        throw new Error(
            `Expected exactly one delegate record for: ${unmatched.map(({ applicationId, email }) => `${applicationId} (${email})`).join(", ")}. No updates or emails were made.`,
        );
    }
    const delegates = delegateMatches.map(([delegate]) => delegate);

    const [committees, applications, payments] = await Promise.all([
        withSession(Committee.find().select("code name active totalSeats allocationRevision")),
        withSession(Application.find({ applicationId: { $in: targets.map(({ applicationId }) => applicationId) } })
            .select("applicationId participantType status")),
        withSession(Payment.find({ applicationId: { $in: targets.map(({ applicationId }) => applicationId) } })
            .select("applicationId paymentStatus")),
    ]);

    const committeeByCode = new Map(committees.map((committee) => [committee.code.toLowerCase(), committee]));
    const applicationById = new Map(applications.map((application) => [application.applicationId, application]));
    const paymentById = new Map(payments.map((payment) => [payment.applicationId, payment]));
    const changes: PlannedChange[] = [];
    const unchanged: PreparedPlan["unchanged"] = [];

    for (const [index, target] of targets.entries()) {
        const delegate = delegates[index]!;
        if (target.fullName && target.fullName.toLowerCase() !== delegate.fullName.toLowerCase()) {
            throw new Error(`Name mismatch for ${target.applicationId} (${target.email}). No updates or emails were made.`);
        }
        if (target.firstPreference.toLowerCase() !== delegate.firstPreference.toLowerCase()) {
            throw new Error(
                `First-preference mismatch for ${target.applicationId} (${target.email}). No updates or emails were made.`,
            );
        }
        const application = applicationById.get(target.applicationId);
        if (!application) throw new Error(`Application not found for ${target.applicationId}. No updates or emails were made.`);
        const payment = paymentById.get(target.applicationId);
        if (!payment || payment.paymentStatus !== "Confirmed") {
            throw new Error(`Payment is not confirmed for ${target.applicationId}. No updates or emails were made.`);
        }

        const targetCommittee = committeeByCode.get(target.newCommittee.toLowerCase());
        if (!targetCommittee || !targetCommittee.active) {
            throw new Error(`Target committee "${target.newCommittee}" is missing or inactive. No updates or emails were made.`);
        }
        if (targetCommittee.code.toLowerCase() !== delegate.firstPreference.toLowerCase()) {
            throw new Error(
                `Target committee ${targetCommittee.code} is not ${delegate.fullName}'s stored first preference (${delegate.firstPreference}). No updates or emails were made.`,
            );
        }

        const previousCode = delegate.assignedCommittee?.trim();
        if (!previousCode) {
            throw new Error(`${delegate.fullName} has no current committee assignment to reallocate. No updates or emails were made.`);
        }
        const previousPortfolio = delegate.assignedPortfolio?.trim() ?? "";
        if (
            previousCode.toLowerCase() === targetCommittee.code.toLowerCase() &&
            previousPortfolio === target.newPortfolio
        ) {
            unchanged.push({
                applicationId: target.applicationId,
                email: target.email,
                committee: targetCommittee.code,
            });
            continue;
        }

        const previousCommittee = committeeByCode.get(previousCode.toLowerCase());
        if (!previousCommittee) {
            throw new Error(`Current committee "${previousCode}" for ${delegate.fullName} was not found. No updates or emails were made.`);
        }
        changes.push({
            delegateId: delegate._id,
            applicationId: target.applicationId,
            email: delegate.email,
            fullName: delegate.fullName,
            previousCommittee: previousCommittee.name,
            previousPortfolio,
            committeeCode: targetCommittee.code,
            committeeName: targetCommittee.name,
            portfolio: target.newPortfolio,
            firstPreference: delegate.firstPreference,
            delegateStatus: delegate.delegateStatus,
        });
    }

    if (changes.length === 0) return { changes, unchanged };

    const destinationCodes = [...new Set(changes.map(({ committeeCode }) => committeeCode))];
    if (lockCommittees && session) {
        for (const code of destinationCodes.sort()) {
            const locked = await Committee.findOneAndUpdate(
                { code, active: true },
                { $inc: { allocationRevision: 1 } },
                { returnDocument: "after", session },
            ).select("code");
            if (!locked) throw new Error(`Target committee ${code} became unavailable. No updates or emails were made.`);
        }
    }

    const movingIds = changes.map(({ delegateId }) => delegateId);
    const assignments = await withSession(
        Delegate.find({ assignedCommittee: { $in: destinationCodes } }).select("_id applicationId assignedCommittee assignedPortfolio"),
    );
    const destinationCounts = new Map<string, number>();
    for (const code of destinationCodes) {
        destinationCounts.set(code, assignments.filter((delegate) => delegate.assignedCommittee === code).length);
    }
    const changedIdSet = new Set(movingIds.map(String));
    const finalAssignmentCounts = new Map(destinationCounts);
    for (const change of changes) {
        const oldCode = delegates.find((delegate) => String(delegate?._id) === String(change.delegateId))?.assignedCommittee;
        if (oldCode && finalAssignmentCounts.has(oldCode)) {
            finalAssignmentCounts.set(oldCode, (finalAssignmentCounts.get(oldCode) ?? 0) - 1);
        }
        finalAssignmentCounts.set(change.committeeCode, (finalAssignmentCounts.get(change.committeeCode) ?? 0) + 1);
    }

    for (const code of destinationCodes) {
        const committee = committeeByCode.get(code.toLowerCase());
        const count = finalAssignmentCounts.get(code) ?? 0;
        const seatLimit = committee?.totalSeats ?? 0;
        if (seatLimit > 0 && count > seatLimit) {
            throw new Error(`Reallocation would exceed ${code}'s capacity (${count}/${seatLimit}). No updates or emails were made.`);
        }
    }

    const plannedPortfolios = new Set<string>();
    for (const change of changes) {
        const key = `${change.committeeCode.toLowerCase()}\0${change.portfolio.toLowerCase()}`;
        if (plannedPortfolios.has(key)) {
            throw new Error(`The target list assigns portfolio "${change.portfolio}" more than once in ${change.committeeCode}. No updates or emails were made.`);
        }
        plannedPortfolios.add(key);
    }
    const existingPortfolios = assignments.filter((delegate) => !changedIdSet.has(String(delegate._id)));
    for (const change of changes) {
        const duplicate = existingPortfolios.find(
            (delegate) =>
                delegate.assignedCommittee === change.committeeCode &&
                delegate.assignedPortfolio?.trim().toLowerCase() === change.portfolio.toLowerCase(),
        );
        if (duplicate) {
            throw new Error(`Portfolio "${change.portfolio}" is already assigned in ${change.committeeCode}. No updates or emails were made.`);
        }
    }

    return { changes, unchanged };
}

async function main(): Promise<void> {
    loadEnvConfig(process.cwd());
    const args = process.argv.slice(2);
    const apply = args.includes("--apply");
    const paths = args.filter((arg) => arg !== "--apply");
    if (paths.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--apply")) {
        throw new Error("Usage: npx tsx scripts/reallocate-delegates.ts reallocated_delegates/orange_highlighted_delegates.json [--apply]");
    }
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required. Set it in .env.local before running this script.");

    const jsonPath = path.resolve(process.cwd(), paths[0]);
    const input = JSON.parse(await readFile(jsonPath, "utf8")) as unknown;
    const targets = parseTargets(input);
    const [{ default: connectDB }, { syncApplicationStatus }, { sendReallocationEmail }, { default: Application }, { default: Committee }, { default: Delegate }, { default: Payment }] =
        await Promise.all([
            import("../src/lib/db"),
            import("../src/lib/allocation"),
            import("../src/lib/mailer"),
            import("../src/models/Application"),
            import("../src/models/Committee"),
            import("../src/models/Delegate"),
            import("../src/models/Payment"),
        ]);
    await connectDB({ skipCommitteeSeed: true });

    try {
    const models = { Application, Committee, Delegate, Payment };
    const session = await mongoose.startSession();
    let plan: PreparedPlan = { changes: [], unchanged: [] };
    try {
        if (!apply) {
            plan = await preparePlan(targets, null, false, models);
        } else {
            await session.withTransaction(async () => {
                plan = await preparePlan(targets, session, true, models);
                for (const change of plan.changes) {
                    await Delegate.updateOne(
                        { _id: change.delegateId },
                        {
                            $set: {
                                assignedCommittee: change.committeeCode,
                                assignedPortfolio: change.portfolio,
                                delegateStatus: "Active",
                            },
                        },
                        { session },
                    );
                }
                for (const applicationId of new Set(plan.changes.map(({ applicationId }) => applicationId))) {
                    await syncApplicationStatus(applicationId, session);
                }
            });
        }
    } finally {
        await session.endSession();
    }

    console.info(`[reallocation] ${plan.changes.length} assignment update(s); ${plan.unchanged.length} already match.`);
    for (const change of plan.changes) {
        console.info(
            `[reallocation] ${change.applicationId} | ${change.fullName} | ${change.previousCommittee} -> ${change.committeeName} | ${change.portfolio}`,
        );
    }
    for (const unchanged of plan.unchanged) {
        console.info(`[reallocation] unchanged: ${unchanged.applicationId} | ${unchanged.email} | ${unchanged.committee}`);
    }
    if (!apply) {
        console.info("[reallocation] Dry run only. Add --apply to update assignments and send emails.");
        return;
    }

    let failedEmails = false;
    for (const change of plan.changes) {
        const [delegate, application, payment, committee] = await Promise.all([
            Delegate.findById(change.delegateId).select("email fullName applicationId firstPreference assignedCommittee assignedPortfolio delegateStatus")
                .lean<Pick<IDelegate, "email" | "fullName" | "applicationId" | "firstPreference" | "assignedCommittee" | "assignedPortfolio" | "delegateStatus">>(),
            Application.findOne({ applicationId: change.applicationId }).select("status")
                .lean<Pick<IApplication, "status">>(),
            Payment.findOne({ applicationId: change.applicationId }).select("paymentStatus")
                .lean<Pick<IPayment, "paymentStatus">>(),
            Committee.findOne({ code: change.committeeCode }).select("name")
                .lean<{ name: string }>(),
        ]);
        if (!delegate || !application || !payment || !committee ||
            delegate.assignedCommittee !== change.committeeCode ||
            delegate.assignedPortfolio !== change.portfolio ||
            payment.paymentStatus !== "Confirmed") {
            console.error(`[reallocation] skipped email for ${change.applicationId}: current database state no longer matches the planned assignment.`);
            failedEmails = true;
            continue;
        }

        const sent = await sendReallocationEmail({
            applicationId: delegate.applicationId,
            email: delegate.email,
            fullName: delegate.fullName,
            previousCommittee: change.previousCommittee,
            previousPortfolio: change.previousPortfolio || "Not assigned",
            committee: committee.name,
            portfolio: delegate.assignedPortfolio,
            firstPreference: delegate.firstPreference,
            delegateStatus: delegate.delegateStatus,
            applicationStatus: application.status,
            paymentStatus: payment.paymentStatus,
        });
        console.info(`[reallocation] email ${delegate.email}: ${sent ? "sent" : "failed"}`);
        failedEmails ||= !sent;
    }
    if (failedEmails) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error: unknown) => {
    console.error("Delegate reallocation failed:", error);
    process.exitCode = 1;
});
