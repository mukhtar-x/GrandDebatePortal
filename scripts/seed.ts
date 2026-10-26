import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import Application from "../src/models/Application";
import Committee from "../src/models/Committee";
import Delegate from "../src/models/Delegate";
import Payment from "../src/models/Payment";

loadEnvConfig(process.cwd());

const COMMITTEES = [
    {
        code: "UNSC",
        name: "United Nations Security Council",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 50,
        studyGuideUrl: "/docs/committees/unsc-study-guide.pdf",
        active: true,
    },
    {
        code: "DISEC",
        name: "Disarmament and International Security Committee",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 50,
        studyGuideUrl: "/docs/committees/disec-study-guide.pdf",
        active: true,
    },
    {
        code: "SOCHUM",
        name: "Social, Humanitarian and Cultural Committee",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 50,
        studyGuideUrl: "/docs/committees/sochum-study-guide.pdf",
        active: true,
    },
    {
        code: "UN Women",
        name: "United Nations Entity for Gender Equality and the Empowerment of Women",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 50,
        studyGuideUrl: "/docs/committees/unwomen-study-guide.pdf",
        active: true,
    },
    {
        code: "PNA",
        name: "Pakistan National Assembly",
        agenda: "To be announced",
        suitedTo: "All delegates",
        level: "All levels",
        totalSeats: 50,
        studyGuideUrl: "/docs/committees/pna-study-guide.pdf",
        active: true,
    },
] as const;

const SOLO_ID = "TGD-2026-SEED-SOLO";
const DELEGATION_ID = "TGD-2026-SEED-DELEGATION";

const soloDelegate = {
    applicationId: SOLO_ID,
    fullName: "Amina Demo",
    email: "amina.solo@example.com",
    whatsappNumber: "+923001234567",
    experienceLevel: "1 to 3 conferences",
    firstPreference: "UNSC",
    secondPreference: "DISEC",
    assignedCommittee: null,
    assignedPortfolio: null,
    delegateStatus: "Active",
    isHead: false,
} as const;

const delegationMembers = [
    {
        fullName: "Hassan Demo",
        email: "hassan.head@example.com",
        whatsappNumber: "+923001234568",
        experienceLevel: "4 or more",
        firstPreference: "DISEC",
        secondPreference: "PNA",
        isHead: true,
    },
    {
        fullName: "Sara Demo",
        email: "sara.member@example.com",
        whatsappNumber: "+923001234569",
        experienceLevel: "1 to 3 conferences",
        firstPreference: "SOCHUM",
        secondPreference: "UN Women",
        isHead: false,
    },
    {
        fullName: "Bilal Demo",
        email: "bilal.member@example.com",
        whatsappNumber: "+923001234570",
        experienceLevel: "None",
        firstPreference: "UNSC",
        secondPreference: "PNA",
        isHead: false,
    },
    {
        fullName: "Noor Demo",
        email: "noor.member@example.com",
        whatsappNumber: "+923001234571",
        experienceLevel: "1 to 3 conferences",
        firstPreference: "PNA",
        secondPreference: "DISEC",
        isHead: false,
    },
] as const;

async function seed(): Promise<void> {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required. Set it in .env.local before seeding.");

    await mongoose.connect(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 });
    try {
        await Committee.bulkWrite(
            COMMITTEES.map((committee) => ({
                updateOne: {
                    filter: { code: committee.code },
                    update: { $set: committee },
                    upsert: true,
                },
            })),
        );

        await Application.updateOne(
            { applicationId: SOLO_ID },
            {
                $set: {
                    participantType: "solo",
                    delegateCount: 1,
                    institution: "Seed Demo University",
                    status: "Payment under review",
                    contactName: soloDelegate.fullName,
                    contactEmail: soloDelegate.email,
                    contactWhatsapp: soloDelegate.whatsappNumber,
                    headIsDelegate: false,
                },
            },
            { upsert: true, runValidators: true },
        );
        await Delegate.updateOne(
            { applicationId: SOLO_ID, email: soloDelegate.email },
            { $set: soloDelegate },
            { upsert: true, runValidators: true },
        );
        await Payment.updateOne(
            { applicationId: SOLO_ID },
            {
                $set: {
                    totalPayable: 2000,
                    rateType: "Early bird",
                    receiptUrl: "https://example.invalid/seed-receipt-solo.png",
                    transactionId: "SEED-SOLO-001",
                    paymentStatus: "Pending",
                    reviewedBy: "Development seed",
                },
            },
            { upsert: true, runValidators: true },
        );

        await Application.updateOne(
            { applicationId: DELEGATION_ID },
            {
                $set: {
                    participantType: "delegation",
                    delegateCount: delegationMembers.length,
                    institution: "Seed Demo College",
                    status: "Payment confirmed",
                    contactName: "Hassan Demo",
                    contactEmail: "hassan.head@example.com",
                    contactWhatsapp: "+923001234568",
                    headIsDelegate: true,
                },
            },
            { upsert: true, runValidators: true },
        );
        await Delegate.bulkWrite(
            delegationMembers.map((member) => ({
                updateOne: {
                    filter: { applicationId: DELEGATION_ID, email: member.email },
                    update: {
                        $set: {
                            ...member,
                            applicationId: DELEGATION_ID,
                            whatsappNumber: member.whatsappNumber,
                            assignedCommittee: null,
                            assignedPortfolio: null,
                            delegateStatus: "Active",
                        },
                    },
                    upsert: true,
                },
            })),
        );
        await Payment.updateOne(
            { applicationId: DELEGATION_ID },
            {
                $set: {
                    totalPayable: 8000,
                    rateType: "Early bird",
                    receiptUrl: "https://example.invalid/seed-receipt-delegation.png",
                    transactionId: "SEED-DELEGATION-001",
                    paymentStatus: "Confirmed",
                    reviewedAt: new Date("2026-10-25T00:00:00.000Z"),
                    reviewedBy: "Development seed",
                },
            },
            { upsert: true, runValidators: true },
        );

        console.info("Seed complete: 5 committees, 1 solo application, 1 four-delegate delegation.");
        console.info(`Seed application IDs: ${SOLO_ID}, ${DELEGATION_ID}`);
    } finally {
        await mongoose.disconnect();
    }
}

seed().catch((error: unknown) => {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
});
