import { requireAdmin } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import Application from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

const COLUMNS = [
    "applicationId",
    "type",
    "institution",
    "applicationStatus",
    "paymentStatus",
    "totalPayable",
    "rateType",
    "transactionId",
    "contactName",
    "contactEmail",
    "contactWhatsapp",
    "delegateName",
    "delegateEmail",
    "delegateWhatsapp",
    "isHead",
    "experience",
    "firstPreference",
    "secondPreference",
    "assignedCommittee",
    "assignedPortfolio",
    "delegateStatus",
    "registeredAt",
] as const;

/** Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @ prefixes). */
function csvCell(value: unknown): string {
    let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
    // Plain phone numbers like +923001234567 cannot run as formulas, so they stay readable.
    if (/^[=+\-@\t\r]/.test(text) && !/^\+\d{6,15}$/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

/** One row per delegate, joined with application and payment details. */
export async function GET(request: Request): Promise<Response> {
    const auth = requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        await connectDB();
        const rows = await Delegate.aggregate<Record<string, unknown>>([
            { $sort: { applicationId: 1, isHead: -1, createdAt: 1 } },
            {
                $lookup: {
                    from: Application.collection.name,
                    localField: "applicationId",
                    foreignField: "applicationId",
                    as: "application",
                },
            },
            {
                $lookup: {
                    from: Payment.collection.name,
                    localField: "applicationId",
                    foreignField: "applicationId",
                    as: "payment",
                },
            },
            { $unwind: { path: "$application", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    applicationId: 1,
                    type: "$application.participantType",
                    institution: "$application.institution",
                    applicationStatus: "$application.status",
                    paymentStatus: "$payment.paymentStatus",
                    totalPayable: "$payment.totalPayable",
                    rateType: "$payment.rateType",
                    transactionId: "$payment.transactionId",
                    contactName: "$application.contactName",
                    contactEmail: "$application.contactEmail",
                    contactWhatsapp: "$application.contactWhatsapp",
                    delegateName: "$fullName",
                    delegateEmail: "$email",
                    delegateWhatsapp: "$whatsappNumber",
                    isHead: 1,
                    experience: "$experienceLevel",
                    firstPreference: 1,
                    secondPreference: 1,
                    assignedCommittee: 1,
                    assignedPortfolio: 1,
                    delegateStatus: 1,
                    registeredAt: "$application.createdAt",
                },
            },
        ]);

        const csv = [
            COLUMNS.join(","),
            ...rows.map((row) => COLUMNS.map((column) => csvCell(row[column])).join(",")),
        ].join("\r\n");
        const date = new Date().toISOString().slice(0, 10);

        return new Response(`﻿${csv}`, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="tgd26-delegates-${date}.csv"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        console.error("CSV export failed:", error);
        return Response.json({ success: false, error: "Export could not be generated." }, { status: 500 });
    }
}
