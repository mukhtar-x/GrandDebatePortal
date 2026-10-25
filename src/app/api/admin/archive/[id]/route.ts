import mongoose from "mongoose";
import { requireAdminMutation } from "@/lib/adminAuth";
import { parseArchiveInput } from "@/lib/archive";
import connectDB from "@/lib/db";
import { readJsonBody } from "@/lib/requestGuards";
import ArchiveDocument from "@/models/ArchiveDocument";

function notFound(): Response {
    return Response.json({ success: false, error: "Document not found." }, { status: 404 });
}

/** Body: any of the fields accepted when adding a document. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/archive/[id]">): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return notFound();

    const parsed = await parseArchiveInput(await readJsonBody(request), true);
    if (!parsed.success) return Response.json({ success: false, error: parsed.error }, { status: 400 });
    if (Object.keys(parsed.value).length === 0) {
        return Response.json({ success: false, error: "No changes were provided." }, { status: 400 });
    }

    try {
        await connectDB();
        const document = await ArchiveDocument.findByIdAndUpdate(id, { $set: parsed.value }, { new: true })
            .select("-__v")
            .lean();
        return document ? Response.json({ success: true, document }) : notFound();
    } catch (error) {
        console.error("Archive document update failed:", error);
        return Response.json({ success: false, error: "Document could not be updated." }, { status: 500 });
    }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/archive/[id]">): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const { id } = await ctx.params;
    if (!mongoose.isValidObjectId(id)) return notFound();

    try {
        await connectDB();
        const deleted = await ArchiveDocument.findByIdAndDelete(id);
        return deleted ? Response.json({ success: true }) : notFound();
    } catch (error) {
        console.error("Archive document deletion failed:", error);
        return Response.json({ success: false, error: "Document could not be deleted." }, { status: 500 });
    }
}
