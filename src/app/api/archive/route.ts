import { connection } from "next/server";
import { EMPTY_FOLDER_MESSAGE, GENERAL_FOLDER } from "@/lib/archive";
import { getCommitteeOptions } from "@/lib/committeeOptions";
import connectDB from "@/lib/db";
import ArchiveDocument, { type IArchiveDocument } from "@/models/ArchiveDocument";

type PublicDocument = {
    id: string;
    title: string;
    description: string | null;
    fileType: string;
    sizeLabel: string | null;
    updatedAt: string | null;
    url: string;
};

function toPublic(doc: IArchiveDocument & { _id: unknown }): PublicDocument {
    return {
        id: String(doc._id),
        title: doc.title,
        description: doc.description ?? null,
        fileType: doc.fileType,
        sizeLabel: doc.sizeLabel ?? null,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
        url: doc.url,
    };
}

/**
 * Document archive: a "General resources" folder and one folder per committee. A committee's
 * study guide link (set on the committee) is listed first in its folder.
 */
export async function GET(): Promise<Response> {
    await connection();
    try {
        await connectDB();
        const [committees, documents] = await Promise.all([
            getCommitteeOptions(),
            ArchiveDocument.find({ published: true })
                .sort({ order: 1, createdAt: 1 })
                .lean<(IArchiveDocument & { _id: unknown })[]>(),
        ]);

        const inFolder = (folder: string) => documents.filter((doc) => doc.folder === folder).map(toPublic);
        const folder = (id: string, name: string, docs: PublicDocument[]) => ({
            id,
            name,
            documents: docs,
            emptyMessage: docs.length === 0 ? EMPTY_FOLDER_MESSAGE : null,
        });

        return Response.json({
            success: true,
            intro: "This archive contains study guides, rules of procedure and other reference material for delegates. New documents are added as committees finalise their materials.",
            general: folder(GENERAL_FOLDER, "General resources", inFolder(GENERAL_FOLDER)),
            committees: committees.map((committee) => {
                const docs = inFolder(committee.code);
                const guide: PublicDocument[] =
                    committee.studyGuideUrl && !docs.some((doc) => doc.url === committee.studyGuideUrl)
                        ? [
                              {
                                  id: `${committee.code}-study-guide`,
                                  title: `${committee.code} Study Guide`,
                                  description: committee.name,
                                  fileType: "PDF",
                                  sizeLabel: null,
                                  updatedAt: null,
                                  url: committee.studyGuideUrl,
                              },
                          ]
                        : [];
                return folder(committee.code, committee.name, [...guide, ...docs]);
            }),
        });
    } catch (error) {
        console.error("Archive lookup failed:", error);
        return Response.json({ success: false, error: "The archive could not be loaded." }, { status: 500 });
    }
}
