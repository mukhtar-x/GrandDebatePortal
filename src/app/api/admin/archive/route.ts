import { requireAdmin, requireAdminMutation } from "@/lib/adminAuth";
import { parseArchiveInput } from "@/lib/archive";
import connectDB from "@/lib/db";
import { readJsonBody } from "@/lib/requestGuards";
import ArchiveDocument from "@/models/ArchiveDocument";

/** All archive documents, including unpublished ones. */
export async function GET(request: Request): Promise<Response> {
    const auth = requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        await connectDB();
        const documents = await ArchiveDocument.find().select("-__v").sort({ folder: 1, order: 1, createdAt: 1 }).lean();
        return Response.json({ success: true, documents });
    } catch (error) {
        console.error("Admin archive list failed:", error);
        return Response.json({ success: false, error: "Documents could not be loaded." }, { status: 500 });
    }
}

/**
 * Body: { folder: "general" | committee code, title, url (https), description?, fileType?,
 * sizeLabel? (e.g. "1.2 MB"), published?, order? }.
 */
export async function POST(request: Request): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const parsed = await parseArchiveInput(await readJsonBody(request), false);
    if (!parsed.success) return Response.json({ success: false, error: parsed.error }, { status: 400 });

    try {
        await connectDB();
        const document = await ArchiveDocument.create(parsed.value);
        return Response.json({ success: true, document }, { status: 201 });
    } catch (error) {
        console.error("Archive document creation failed:", error);
        return Response.json({ success: false, error: "Document could not be added." }, { status: 500 });
    }
}
