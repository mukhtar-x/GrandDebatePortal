import { requireAdmin, requireAdminMutation } from "@/lib/adminAuth";
import connectDB from "@/lib/db";
import { readJsonBody } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { isOneOf, isRecord, normalizeEmail, normalizeString, normalizeWhatsapp } from "@/lib/validation";
import Application, { APPLICATION_STATUSES } from "@/models/Application";
import Delegate from "@/models/Delegate";
import Payment from "@/models/Payment";

export async function GET(
    request: Request,
    ctx: RouteContext<"/api/admin/applications/[applicationId]">,
): Promise<Response> {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();

    try {
        await connectDB();
        const application = await Application.findOne({ applicationId }).select("-__v -idempotencyKey").lean();
        if (!application) {
            return Response.json({ success: false, error: "Application not found." }, { status: 404 });
        }
        const [delegates, payment] = await Promise.all([
            Delegate.find({ applicationId }).select("-__v").sort({ isHead: -1, createdAt: 1 }).lean(),
            Payment.findOne({ applicationId }).select("-__v").lean(),
        ]);

        return Response.json({ success: true, application, delegates, payment });
    } catch (error) {
        console.error("Admin application lookup failed:", error);
        return Response.json({ success: false, error: "Application could not be loaded." }, { status: 500 });
    }
}

/** Updates application details or status safely within a MongoDB transaction. */
export async function PATCH(
    request: Request,
    ctx: RouteContext<"/api/admin/applications/[applicationId]">,
): Promise<Response> {
    const auth = await requireAdminMutation(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
        return Response.json({ success: false, error: "Request body must be a JSON object." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
        if (!isOneOf(APPLICATION_STATUSES, body.status)) {
            return Response.json(
                { success: false, error: `Invalid status. Must be one of: ${APPLICATION_STATUSES.join(", ")}` },
                { status: 400 },
            );
        }
        updates.status = body.status;
    }
    if (body.institution !== undefined) {
        const inst = normalizeString(body.institution);
        if (typeof inst === "string") updates.institution = inst;
    }
    if (body.contactName !== undefined) {
        const name = normalizeString(body.contactName);
        if (typeof name === "string") updates.contactName = name;
    }
    if (body.contactEmail !== undefined) {
        const email = normalizeEmail(body.contactEmail);
        if (email) updates.contactEmail = email;
    }
    if (body.contactWhatsapp !== undefined) {
        const phone = normalizeWhatsapp(body.contactWhatsapp);
        if (phone) updates.contactWhatsapp = phone;
    }

    if (Object.keys(updates).length === 0) {
        return Response.json({ success: false, error: "No changes provided." }, { status: 400 });
    }

    try {
        await connectDB();
        const updated = await withTransaction(async (session) => {
            const app = await Application.findOneAndUpdate(
                { applicationId },
                { $set: updates },
                { returnDocument: "after", runValidators: true, session },
            )
                .select("-__v -idempotencyKey")
                .lean();

            if (!app) throw new Error("Application not found.");
            return app;
        });

        return Response.json({ success: true, application: updated });
    } catch (error) {
        console.error("Admin application update failed:", error);
        const msg = error instanceof Error ? error.message : "Application could not be updated.";
        const status = msg === "Application not found." ? 404 : 500;
        return Response.json({ success: false, error: msg }, { status });
    }
}

/** Deletes an application, delegates, and payment in an atomic transaction to ensure zero orphaned data. */
export async function DELETE(
    request: Request,
    ctx: RouteContext<"/api/admin/applications/[applicationId]">,
): Promise<Response> {
    const auth = await requireAdminMutation(request);
    if (auth.response) return auth.response;

    const applicationId = (await ctx.params).applicationId.trim().toUpperCase();

    try {
        await connectDB();
        await withTransaction(async (session) => {
            const app = await Application.findOne({ applicationId }).session(session);
            if (!app) throw new Error("Application not found.");

            await Promise.all([
                Application.deleteOne({ applicationId }, { session }),
                Delegate.deleteMany({ applicationId }, { session }),
                Payment.deleteOne({ applicationId }, { session }),
            ]);
        });

        return Response.json({ success: true, message: `Application ${applicationId} and associated records deleted.` });
    } catch (error) {
        console.error("Admin application deletion failed:", error);
        const msg = error instanceof Error ? error.message : "Application could not be deleted.";
        const status = msg === "Application not found." ? 404 : 500;
        return Response.json({ success: false, error: msg }, { status });
    }
}
