import { requireAdminMutation } from "@/lib/adminAuth";
import { canonicalCommittee } from "@/lib/allocation";
import connectDB from "@/lib/db";
import { readJsonBody } from "@/lib/requestGuards";
import { isRecord, normalizeString } from "@/lib/validation";
import Committee from "@/models/Committee";

const TEXT_FIELDS = { name: 150, agenda: 500, suitedTo: 500, level: 50 } as const;

/**
 * Body (all optional): { name, agenda, suitedTo, level, totalSeats, studyGuideUrl }.
 * totalSeats 0 means "not limited yet". studyGuideUrl "" clears the guide ("Coming soon").
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/committees/[code]">): Promise<Response> {
    const auth = requireAdminMutation(request);
    if (auth.response) return auth.response;

    const committee = await canonicalCommittee(decodeURIComponent((await ctx.params).code));
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
    if (body.studyGuideUrl !== undefined) {
        const url = normalizeString(body.studyGuideUrl);
        if (url === "" || url === null) {
            unset.studyGuideUrl = "";
        } else {
            let parsed: URL | null = null;
            try {
                parsed = typeof url === "string" && url.length <= 500 ? new URL(url) : null;
            } catch {
                parsed = null;
            }
            if (!parsed || parsed.protocol !== "https:") {
                return Response.json({ success: false, error: "studyGuideUrl must be an https:// link." }, { status: 400 });
            }
            set.studyGuideUrl = parsed.toString();
        }
    }
    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
        return Response.json({ success: false, error: "No changes were provided." }, { status: 400 });
    }

    try {
        await connectDB();
        const updated = await Committee.findOneAndUpdate(
            { code: committee.code },
            { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
            { new: true, runValidators: true },
        )
            .select("-_id -__v")
            .lean();
        return Response.json({ success: true, committee: updated });
    } catch (error) {
        console.error("Committee update failed:", error);
        return Response.json({ success: false, error: "Committee could not be updated." }, { status: 500 });
    }
}
