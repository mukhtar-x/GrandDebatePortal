import mongoose, { Schema } from "mongoose";

export interface IArchiveDocument {
    /** "general" or a committee code such as "UNSC". */
    folder: string;
    title: string;
    description?: string;
    url: string;
    fileType: string;
    sizeLabel?: string;
    published: boolean;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}

const archiveDocumentSchema = new Schema<IArchiveDocument>(
    {
        folder: { type: String, required: true, trim: true, index: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        url: { type: String, required: true, trim: true },
        fileType: { type: String, required: true, trim: true, default: "PDF" },
        sizeLabel: { type: String, trim: true },
        published: { type: Boolean, required: true, default: true },
        order: { type: Number, required: true, default: 0 },
    },
    { timestamps: true },
);

const ArchiveDocument =
    mongoose.models.ArchiveDocument ??
    mongoose.model<IArchiveDocument>("ArchiveDocument", archiveDocumentSchema);

export default ArchiveDocument;
