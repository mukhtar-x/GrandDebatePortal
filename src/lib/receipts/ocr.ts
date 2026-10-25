import path from "node:path";
import type { Worker } from "tesseract.js";

const OCR_TIMEOUT_MS = 40_000;
/** English data shipped with the app (npm @tesseract.js-data/eng), so OCR never downloads anything. */
const LANG_PATH = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");

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

// One worker per warm function instance: a batch of receipts pays the start-up cost once.
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
    workerPromise ??= import("tesseract.js")
        .then(({ createWorker }) => createWorker("eng", 1, { langPath: LANG_PATH, cacheMethod: "none", gzip: true }))
        .catch((error: unknown) => {
            workerPromise = null;
            throw error;
        });
    return workerPromise;
}

async function imageText(buffer: Buffer): Promise<string> {
    const worker = await getWorker();
    try {
        const { data } = await worker.recognize(buffer);
        return data.text;
    } catch (error) {
        // Start a fresh worker next time in case this one is in a bad state.
        workerPromise = null;
        await worker.terminate().catch(() => undefined);
        throw error;
    }
}

export async function extractReceiptText(buffer: Buffer, mime: string): Promise<ExtractedText> {
    if (mime === "application/pdf") {
        return { text: await withTimeout(pdfText(buffer), OCR_TIMEOUT_MS, "PDF text extraction"), provider: "pdf-text" };
    }
    return { text: await withTimeout(imageText(buffer), OCR_TIMEOUT_MS, "OCR"), provider: "tesseract" };
}
