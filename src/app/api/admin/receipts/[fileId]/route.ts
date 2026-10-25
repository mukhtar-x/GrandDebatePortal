import { Readable } from "node:stream";
import { requireAdmin } from "@/lib/adminAuth";
import { openReceipt } from "@/lib/receipts/store";

/** Streams a stored receipt to a signed-in organiser. Receipts are never public. */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/receipts/[fileId]">): Promise<Response> {
    const auth = requireAdmin(request);
    if (auth.response) return auth.response;

    try {
        const receipt = await openReceipt((await ctx.params).fileId);
        if (!receipt) {
            return Response.json({ success: false, error: "Receipt not found." }, { status: 404 });
        }

        const inlineImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
        const isInlineImage = inlineImageTypes.has(receipt.mime);
        const isPdf = receipt.mime === "application/pdf";
        return new Response(Readable.toWeb(receipt.stream) as ReadableStream, {
            headers: {
                "Content-Type": isInlineImage || isPdf ? receipt.mime : "application/octet-stream",
                "Content-Length": String(receipt.length),
                "Content-Disposition": isInlineImage ? "inline" : "attachment",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
            },
        });
    } catch (error) {
        console.error("Receipt download failed:", error);
        return Response.json({ success: false, error: "Receipt could not be loaded." }, { status: 500 });
    }
}
