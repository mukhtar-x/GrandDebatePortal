import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { dHash, sha256Hex } from "@/lib/receipts/hash";

export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_DIMENSION = 1600;
const PDF_DANGEROUS_KEYS = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|Encrypt)\b/;
const EDITING_SOFTWARE =
    /(Adobe Photoshop|Photoshop|GIMP|Snapseed|PicsArt|Canva|Lightroom|Pixelmator|Affinity Photo|Paint\.NET|Fotor|Photopea)/i;

export interface ProcessedReceipt {
    buffer: Buffer;
    mime: "image/jpeg" | "application/pdf";
    originalSize: number;
    sha256: string;
    dhash: string | null;
    editingSoftware: string | null;
}

export type ReceiptResult =
    | { success: true; receipt: ProcessedReceipt }
    | { success: false; error: string; status: number };

function fail(error: string, status = 400): ReceiptResult {
    return { success: false, error, status };
}

/** Editors leave their name in EXIF, XMP or PNG text chunks, which sit near the start of the file. */
function detectEditingSoftware(original: Buffer): string | null {
    const header = original.subarray(0, 128 * 1024).toString("latin1");
    return header.match(EDITING_SOFTWARE)?.[0] ?? null;
}

/**
 * Validates an uploaded payment receipt by its real content (not its name or declared type).
 * Images are re-encoded to JPEG, which strips metadata and anything appended to the file.
 */
export async function processReceipt(file: FormDataEntryValue | null): Promise<ReceiptResult> {
    if (!(file instanceof File) || file.size === 0) {
        return fail("Please upload a screenshot of your payment before submitting.");
    }
    if (file.size > MAX_RECEIPT_BYTES) {
        return fail("The file is too large. Please upload a smaller file.", 413);
    }

    const original = Buffer.from(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(original);
    const sha256 = sha256Hex(original);

    if (detected?.mime === "application/pdf") {
        const content = original.toString("latin1");
        if (PDF_DANGEROUS_KEYS.test(content)) {
            return fail("This PDF cannot be accepted. Please upload a screenshot of the receipt instead.");
        }
        return {
            success: true,
            receipt: {
                buffer: original,
                mime: "application/pdf",
                originalSize: original.length,
                sha256,
                dhash: null,
                editingSoftware: detectEditingSoftware(original),
            },
        };
    }

    if (!detected || !IMAGE_TYPES.has(detected.mime)) {
        return fail("Please upload the receipt as a JPG, PNG, WebP or PDF file.");
    }

    try {
        const buffer = await sharp(original, { limitInputPixels: 50_000_000 })
            .rotate()
            .resize({
                width: MAX_IMAGE_DIMENSION,
                height: MAX_IMAGE_DIMENSION,
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: 75, mozjpeg: true })
            .toBuffer();

        return {
            success: true,
            receipt: {
                buffer,
                mime: "image/jpeg",
                originalSize: original.length,
                sha256,
                dhash: await dHash(buffer),
                editingSoftware: detectEditingSoftware(original),
            },
        };
    } catch {
        return fail("The receipt image could not be read. Please upload a clear screenshot.");
    }
}
