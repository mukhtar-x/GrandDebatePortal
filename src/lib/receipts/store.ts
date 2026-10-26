import mongoose from "mongoose";
import type { Readable } from "node:stream";
import connectDB from "@/lib/db";

const BUCKET_NAME = "receipts";

async function getBucket() {
    await connectDB({ skipCommitteeSeed: true });
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database connection is not ready.");
    return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

function toObjectId(fileId: string) {
    return mongoose.isValidObjectId(fileId) ? new mongoose.Types.ObjectId(fileId) : null;
}

export function receiptUrlFor(fileId: string): string {
    return `/api/admin/receipts/${fileId}`;
}

/** Stores the receipt in GridFS and returns its file id. */
export async function putReceipt(
    buffer: Buffer,
    options: { mime: string; applicationId: string; sha256: string },
): Promise<string> {
    const bucket = await getBucket();
    const extension = options.mime === "application/pdf" ? "pdf" : "jpg";
    const upload = bucket.openUploadStream(`${options.applicationId}.${extension}`, {
        metadata: {
            contentType: options.mime,
            applicationId: options.applicationId,
            sha256: options.sha256,
        },
    });

    await new Promise<void>((resolve, reject) => {
        upload.once("finish", () => resolve());
        upload.once("error", reject);
        upload.end(buffer);
    });

    return upload.id.toString();
}

export async function deleteReceipt(fileId: string): Promise<void> {
    const id = toObjectId(fileId);
    if (!id) return;
    try {
        const bucket = await getBucket();
        await bucket.delete(id);
    } catch (error) {
        console.error("Receipt cleanup failed:", error);
    }
}

export async function readReceiptBuffer(fileId: string): Promise<Buffer | null> {
    const receipt = await openReceipt(fileId);
    if (!receipt) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of receipt.stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}

export async function openReceipt(
    fileId: string,
): Promise<{ stream: Readable; mime: string; length: number } | null> {
    const id = toObjectId(fileId);
    if (!id) return null;

    const bucket = await getBucket();
    const [file] = await bucket.find({ _id: id }).limit(1).toArray();
    if (!file) return null;

    const mime =
        typeof file.metadata?.contentType === "string"
            ? file.metadata.contentType
            : "application/octet-stream";
    return { stream: bucket.openDownloadStream(id), mime, length: file.length };
}
