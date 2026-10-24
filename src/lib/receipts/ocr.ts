import os from "node:os";

const OCR_TIMEOUT_MS = 40_000;

export interface ExtractedText {
    text: string;
    provider: "tesseract" | "pdf-text";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

async function pdfText(buffer: Buffer): Promise<string> {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
}

/**
 * Free, local OCR (tesseract.js). The English language data is downloaded from the
 * tesseract CDN on first use and cached in the temp directory (the only writable path on Vercel).
 */
async function imageText(buffer: Buffer): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, { cachePath: os.tmpdir() });
    try {
        const { data } = await worker.recognize(buffer);
        return data.text;
    } finally {
        await worker.terminate();
    }
}

export async function extractReceiptText(buffer: Buffer, mime: string): Promise<ExtractedText> {
    if (mime === "application/pdf") {
        return { text: await withTimeout(pdfText(buffer), OCR_TIMEOUT_MS, "PDF text extraction"), provider: "pdf-text" };
    }
    return { text: await withTimeout(imageText(buffer), OCR_TIMEOUT_MS, "OCR"), provider: "tesseract" };
}
