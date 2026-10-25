import { getCommitteeOptions } from "@/lib/committeeOptions";
import { isRecord, normalizeString } from "@/lib/validation";
import type { IArchiveDocument } from "@/models/ArchiveDocument";

export const GENERAL_FOLDER = "general";
export const EMPTY_FOLDER_MESSAGE =
    "No documents have been uploaded yet. Study guides will be added as committees finalise them. Follow @tgd_nuces for announcements.";

type ArchiveInput = Partial<
    Pick<IArchiveDocument, "folder" | "title" | "description" | "url" | "fileType" | "sizeLabel" | "published" | "order">
>;

const TEXT_LIMITS = { title: 150, description: 300, fileType: 20, sizeLabel: 20 } as const;

/** Returns the canonical folder name ("general" or a committee code), or null if unknown. */
export async function canonicalFolder(value: unknown): Promise<string | null> {
    if (typeof value !== "string") return null;
    const folder = value.trim().toLowerCase();
    if (folder === GENERAL_FOLDER) return GENERAL_FOLDER;
    const committees = await getCommitteeOptions();
    return committees.find((committee) => committee.code.toLowerCase() === folder)?.code ?? null;
}

function httpsUrl(value: unknown): string | null {
    const text = normalizeString(value);
    if (typeof text !== "string" || text.length > 500) return null;
    try {
        const url = new URL(text);
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Validates an admin create/update body. With `partial`, missing fields are left unchanged;
 * otherwise folder, title and url are required.
 */
export async function parseArchiveInput(
    body: unknown,
    partial: boolean,
): Promise<{ success: true; value: ArchiveInput } | { success: false; error: string }> {
    if (!isRecord(body)) return { success: false, error: "Request body must be a JSON object." };
    const value: ArchiveInput = {};

    if (body.folder !== undefined || !partial) {
        const folder = await canonicalFolder(body.folder);
        if (!folder) return { success: false, error: "folder must be \"general\" or a committee code." };
        value.folder = folder;
    }
    if (body.url !== undefined || !partial) {
        const url = httpsUrl(body.url);
        if (!url) return { success: false, error: "url must be an https:// link." };
        value.url = url;
    }
    for (const [field, max] of Object.entries(TEXT_LIMITS) as [keyof typeof TEXT_LIMITS, number][]) {
        if (body[field] === undefined) {
            if (field === "title" && !partial) return { success: false, error: "title is required." };
            continue;
        }
        const text = normalizeString(body[field]);
        if (typeof text !== "string" || text.length > max || (field === "title" && !text)) {
            return { success: false, error: `${field} must be at most ${max} characters.` };
        }
        value[field] = text;
    }
    if (body.published !== undefined) {
        if (typeof body.published !== "boolean") return { success: false, error: "published must be true or false." };
        value.published = body.published;
    }
    if (body.order !== undefined) {
        if (!Number.isInteger(body.order)) return { success: false, error: "order must be a whole number." };
        value.order = body.order as number;
    }
    return { success: true, value };
}
