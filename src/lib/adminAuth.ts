import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { rejectCrossOrigin } from "@/lib/requestGuards";

const SESSION_HOURS = 12;
const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-tgd_admin" : "tgd_admin";

export interface AdminSession {
    name: string;
    expiresAt: number;
}

function adminPassword(): string | null {
    const password = process.env.ADMIN_PASSWORD;
    return password && password.length >= 8 ? password : null;
}

/** Derived from the password, so changing ADMIN_PASSWORD signs every admin out. */
function signingKey(password: string): Buffer {
    return createHash("sha256").update(`tgd-admin-session:${password}`).digest();
}

function sign(payload: string, password: string): string {
    return createHmac("sha256", signingKey(password)).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
    const left = createHash("sha256").update(a).digest();
    const right = createHash("sha256").update(b).digest();
    return timingSafeEqual(left, right);
}

export function isAdminConfigured(): boolean {
    return adminPassword() !== null;
}

export function checkAdminPassword(candidate: string): boolean {
    const password = adminPassword();
    return password !== null && safeEqual(candidate, password);
}

function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get("cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return rest.join("=");
    }
    return null;
}

export function getAdminSession(request: Request): AdminSession | null {
    const password = adminPassword();
    const token = readCookie(request, COOKIE_NAME);
    if (!password || !token) return null;

    const [expires, encodedName, signature] = token.split(".");
    if (!expires || !encodedName || !signature) return null;
    if (!safeEqual(signature, sign(`${expires}.${encodedName}`, password))) return null;

    const expiresAt = Number(expires);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

    return { name: Buffer.from(encodedName, "base64url").toString("utf8"), expiresAt };
}

/** Returns a 401 response when the request has no valid admin session. */
export function requireAdmin(request: Request): { session: AdminSession; response: null } | { session: null; response: Response } {
    const session = getAdminSession(request);
    if (session) return { session, response: null };
    return {
        session: null,
        response: Response.json({ success: false, error: "Admin sign-in required." }, { status: 401 }),
    };
}

/** For admin routes that change data: same-origin check plus a valid session. */
export function requireAdminMutation(request: Request) {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return { session: null, response: crossOrigin } as const;
    return requireAdmin(request);
}

export function adminSessionCookie(name: string): string {
    const password = adminPassword();
    if (!password) throw new Error("ADMIN_PASSWORD is not configured.");
    const expires = String(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    const encodedName = Buffer.from(name, "utf8").toString("base64url");
    const token = `${expires}.${encodedName}.${sign(`${expires}.${encodedName}`, password)}`;
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

export function clearAdminSessionCookie(): string {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
