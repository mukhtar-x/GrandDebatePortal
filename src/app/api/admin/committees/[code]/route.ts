import { requireAdminMutation } from "@/lib/adminAuth";
import { canonicalCommittee } from "@/lib/allocation";
import connectDB from "@/lib/db";
import { readJsonBody } from "@/lib/requestGuards";
import { withTransaction } from "@/lib/transaction";
import { escapeRegex, isRecord, normalizeString } from "@/lib/validation";
import Committee from "@/models/Committee";
import Delegate from "@/models/Delegate";

const TEXT_FIELDS = { name: 150, agenda: 500, suitedTo: 500, level: 50 } as const;

/**
 * Body (all optional): { name, agenda, suitedTo, level, totalSeats, studyGuideUrl, active }.
 * totalSeats 0 means "not limited yet". studyGuideUrl "" clears the guide ("Coming soon").
 * Supports both relative paths (/docs/...) and https:// links.
 * Executes inside MongoDB transaction to prevent accidental partial writes.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/committees/[code]">): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const rawCode = decodeURIComponent((await ctx.params).code);
    const committee = await canonicalCommittee(rawCode);
    if (!committee) return Response.json({ success: false, error: "Committee not found." }, { status: 404 });

    const body = await readJsonBody(request);
    if (!isRecord(body)) {
        return Response.json({ success: false, error: "Request body must be a JSON object." }, { status: 400 });
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    for (const [field, max] of Object.entries(TEXT_FIELDS)) {
        if (body[field] === undefined) continue;
        const value = normalizeString(body[field]);
        if (typeof value !== "string" || !value || value.length > max) {
            return Response.json({ success: false, error: `${field} must be 1 to ${max} characters.` }, { status: 400 });
        }
        set[field] = value;
    }
    if (body.totalSeats !== undefined) {
        if (!Number.isInteger(body.totalSeats) || (body.totalSeats as number) < 0 || (body.totalSeats as number) > 500) {
            return Response.json({ success: false, error: "totalSeats must be a whole number from 0 to 500." }, { status: 400 });
        }
        set.totalSeats = body.totalSeats;
    }
    if (body.active !== undefined) {
        set.active = Boolean(body.active);
    }
    if (body.studyGuideUrl !== undefined) {
        const url = normalizeString(body.studyGuideUrl);
        if (url === "" || url === null) {
            unset.studyGuideUrl = "";
        } else if (typeof url === "string") {
            if (url.startsWith("/")) {
                set.studyGuideUrl = url;
            } else {
                let parsed: URL | null = null;
                try {
                    parsed = url.length <= 500 ? new URL(url) : null;
                } catch {
                    parsed = null;
                }
                if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
                    return Response.json(
                        { success: false, error: "studyGuideUrl must be a valid relative path (e.g. /docs/...) or http(s) link." },
                        { status: 400 },
                    );
                }
                set.studyGuideUrl = parsed.toString();
            }
        }
    }
    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
        return Response.json({ success: false, error: "No changes were provided." }, { status: 400 });
    }

    try {
        await connectDB();
        const updated = await withTransaction(async (session) => {
            return Committee.findOneAndUpdate(
                { code: new RegExp("^" + escapeRegex(committee.code) + "$", "i") },
                {
                    ...(Object.keys(set).length ? { $set: set } : {}),
                    ...(Object.keys(unset).length ? { $unset: unset } : {}),
                },
                { new: true, runValidators: true, session, upsert: true },
            )
                .select("-_id -__v")
                .lean();
        });
        return Response.json({ success: true, committee: updated });
    } catch (error) {
        console.error("Committee update failed:", error);
        return Response.json({ success: false, error: "Committee could not be updated." }, { status: 500 });
    }
}

/** Deletes or deactivates a committee within a transaction to protect assigned delegates. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/committees/[code]">): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const rawCode = decodeURIComponent((await ctx.params).code);
    const committee = await canonicalCommittee(rawCode);
    if (!committee) return Response.json({ success: false, error: "Committee not found." }, { status: 404 });

    try {
        await connectDB();
        await withTransaction(async (session) => {
            const assignedCount = await Delegate.countDocuments({
                assignedCommittee: new RegExp("^" + escapeRegex(committee.code) + "$", "i"),
            }).session(session);

            if (assignedCount > 0) {
                await Committee.updateOne(
                    { code: new RegExp("^" + escapeRegex(committee.code) + "$", "i") },
                    { $set: { active: false } },
                    { session },
                );
            } else {
                await Committee.deleteOne(
                    { code: new RegExp("^" + escapeRegex(committee.code) + "$", "i") },
                    { session },
                );
            }
        });
        return Response.json({ success: true, message: `Committee ${committee.code} removed or deactivated.` });
    } catch (error) {
        console.error("Committee deletion failed:", error);
        return Response.json({ success: false, error: "Committee could not be deleted." }, { status: 500 });
    }
}
