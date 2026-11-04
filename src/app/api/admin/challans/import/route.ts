import connectDB from "@/lib/db";
import { requireAdmin, requireAdminMutation } from "@/lib/adminAuth";
import { readJsonBody } from "@/lib/requestGuards";
import { isRecord } from "@/lib/validation";
import Challan, { CHALLAN_CATEGORIES, type ChallanCategory } from "@/models/Challan";
import { withTransaction } from "@/lib/transaction";

const DELEGATE_COUNT: Record<ChallanCategory, number> = {
    solo: 1,
    "delegation-4": 4,
    "delegation-5": 5,
    "delegation-6": 6,
    "delegation-7": 7,
};

/** Imports FAST-issued inventory in batches. Request: { challans: [{ challanNumber, category, rateType, amount }] }. */
export async function POST(request: Request): Promise<Response> {
    const auth = await requireAdminMutation(request);
    if (auth.response) return auth.response;
    const body = await readJsonBody(request);
    if (!isRecord(body) || !Array.isArray(body.challans) || body.challans.length < 1 || body.challans.length > 5000) {
        return Response.json({ success: false, error: "Provide between 1 and 5,000 challans." }, { status: 400 });
    }
    const rows: Array<{ challanNumber: string; category: ChallanCategory; rateType: "Early bird" | "Regular"; amount: number }> = [];
    const seen = new Set<string>();
    for (const [index, value] of body.challans.entries()) {
        if (!isRecord(value)) return Response.json({ success: false, error: `Challan ${index + 1} is invalid.` }, { status: 400 });
        const challanNumber = typeof value.challanNumber === "string" ? value.challanNumber.trim() : "";
        const category = value.category;
        const rateType = value.rateType;
        const amount = value.amount;
        if (!/^[A-Za-z0-9-]{4,40}$/.test(challanNumber) || /^TEST-/i.test(challanNumber) || seen.has(challanNumber)) {
            return Response.json({ success: false, error: `Challan number at row ${index + 1} is invalid or duplicated.` }, { status: 400 });
        }
        if (typeof category !== "string" || !CHALLAN_CATEGORIES.includes(category as ChallanCategory) || (rateType !== "Early bird" && rateType !== "Regular") || typeof amount !== "number") {
            return Response.json({ success: false, error: `Category, rate, or amount at row ${index + 1} is invalid.` }, { status: 400 });
        }
        const count = DELEGATE_COUNT[category as ChallanCategory];
        const perDelegate = rateType === "Early bird" ? 2000 : 2400;
        const expectedAmount = count * perDelegate + (count > 1 ? 500 : 0);
        if (amount !== expectedAmount) {
            return Response.json({ success: false, error: `Amount for ${challanNumber} must be PKR ${expectedAmount.toLocaleString("en-PK")} for ${rateType} ${category}.` }, { status: 400 });
        }
        seen.add(challanNumber);
        rows.push({ challanNumber, category: category as ChallanCategory, rateType, amount });
    }
    try {
        await connectDB({ skipCommitteeSeed: true });
        await withTransaction(async (session) => {
            await Challan.insertMany(rows.map((row) => ({ ...row, environment: "live", status: "Available" })), { session, ordered: true });
        });
        return Response.json({ success: true, imported: rows.length }, { status: 201 });
    } catch (error) {
        if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
            return Response.json({ success: false, error: "One or more challan numbers already exist; no challans were imported." }, { status: 409 });
        }
        console.error("Challan import failed:", error);
        return Response.json({ success: false, error: "Challan inventory could not be imported." }, { status: 500 });
    }
}

export async function GET(request: Request): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    try {
        await connectDB({ skipCommitteeSeed: true });
        await Challan.updateMany({ environment: { $in: ["test", "live"] }, status: { $in: ["Reserved", "Expired"] }, graceUntil: { $lte: new Date() } }, {
            $set: { status: "Available" },
            $unset: { reservationTokenHash: 1, registrationFingerprint: 1, reservationContactHash: 1, reservedAt: 1, expiresAt: 1, graceUntil: 1 },
        });
        const inventory = await Challan.aggregate([
            { $group: { _id: { environment: "$environment", category: "$category", rateType: "$rateType", amount: "$amount", status: "$status" }, count: { $sum: 1 } } },
            { $sort: { "_id.environment": 1, "_id.rateType": 1, "_id.category": 1, "_id.status": 1 } },
        ]);
        return Response.json({ success: true, inventory });
    } catch (error) {
        console.error("Challan inventory lookup failed:", error);
        return Response.json({ success: false, error: "Challan inventory could not be loaded." }, { status: 500 });
    }
}
