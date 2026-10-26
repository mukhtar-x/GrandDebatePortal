import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import connectDB from "@/lib/db";
import AdminAuditLog from "@/models/AdminAuditLog";
import AdminSession from "@/models/AdminSession";
import { rejectCrossOrigin } from "@/lib/requestGuards";

const SESSION_HOURS = 12;
const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-tgd_admin" : "tgd_admin";
const scryptAsync = promisify(scrypt);

interface AdminUser {
    userId: string;
    name: string;
    passwordHash: string;
}

export interface AdminSessionInfo {
    userId: string;
    name: string;
    expiresAt: number;
}

interface AuthenticatedAdmin extends Pick<AdminUser, "userId" | "name"> {
    credentialVersion: string;
}

function adminUsers(): AdminUser[] {
    try {
        const parsed: unknown = JSON.parse(process.env.ADMIN_USERS ?? "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((user): user is AdminUser =>
            typeof user?.userId === "string" &&
            typeof user?.name === "string" &&
            typeof user?.passwordHash === "string" &&
            /^[a-zA-Z0-9_-]{3,50}$/.test(user.userId) &&
            user.name.trim().length > 0 &&
            /^scrypt\$[A-Za-z0-9_-]{22,}\$[A-Za-z0-9_-]{43}$/.test(user.passwordHash),
        );
    } catch {
        return [];
    }
}

function tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function isAdminConfigured(): boolean {
    return adminUsers().length > 0;
}

async function verifyPassword(candidate: string, encoded: string): Promise<boolean> {
    const [, salt, expectedText] = encoded.split("$");
    try {
        const expected = Buffer.from(expectedText, "base64url");
        const actual = (await scryptAsync(candidate, Buffer.from(salt, "base64url"), expected.length)) as Buffer;
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
        return false;
    }
}

export async function authenticateAdmin(userId: string, password: string): Promise<AuthenticatedAdmin | null> {
    const normalizedUserId = userId.trim().toLowerCase();
    const user = adminUsers().find((candidate) => candidate.userId.trim().toLowerCase() === normalizedUserId);
    if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
    return {
        userId: normalizedUserId,
        name: user.name.trim(),
        credentialVersion: createHash("sha256").update(user.passwordHash).digest("hex"),
    };
}

export async function createAdminSession(user: AuthenticatedAdmin): Promise<{ token: string; expiresAt: number }> {
    await connectDB({ skipCommitteeSeed: true });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    await AdminSession.create({
        tokenHash: tokenHash(token),
        userId: user.userId,
        name: user.name,
        credentialVersion: user.credentialVersion,
        expiresAt: new Date(expiresAt),
    });
    return { token, expiresAt };
}

function readCookie(request: Request): string | null {
    const header = request.headers.get("cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === COOKIE_NAME) return rest.join("=");
    }
    return null;
}

export async function getAdminSession(request: Request): Promise<AdminSessionInfo | null> {
    const token = readCookie(request);
    if (!token) return null;
    await connectDB({ skipCommitteeSeed: true });
    const session = await AdminSession.findOne({
        tokenHash: tokenHash(token),
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
    }).select("userId name expiresAt credentialVersion").lean<{
        userId: string;
        name: string;
        expiresAt: Date;
        credentialVersion: string;
    }>();
    if (!session) return null;
    const configuredUser = adminUsers().find((user) => user.userId.trim().toLowerCase() === session.userId);
    if (!configuredUser) return null;
    const currentVersion = createHash("sha256").update(configuredUser.passwordHash).digest("hex");
    if (currentVersion !== session.credentialVersion) return null;
    return { userId: session.userId, name: session.name, expiresAt: session.expiresAt.getTime() };
}

export async function revokeAdminSession(request: Request): Promise<void> {
    const token = readCookie(request);
    if (!token) return;
    await connectDB({ skipCommitteeSeed: true });
    await AdminSession.updateOne(
        { tokenHash: tokenHash(token), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
    );
}

/** Returns a 401 response when the request has no valid admin session. */
export async function requireAdmin(
    request: Request,
): Promise<{ session: AdminSessionInfo; response: null } | { session: null; response: Response }> {
    try {
        const session = await getAdminSession(request);
        if (session) return { session, response: null };
        return {
            session: null,
            response: Response.json({ success: false, error: "Admin sign-in required." }, { status: 401 }),
        };
    } catch (error) {
        console.error("Admin session lookup failed:", error);
        return {
            session: null,
            response: Response.json({ success: false, error: "Admin authentication is temporarily unavailable." }, { status: 503 }),
        };
    }
}

/** Same-origin check, valid session, then append a PII-free record of each authorized mutation. */
export async function requireAdminMutation(request: Request) {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return { session: null, response: crossOrigin } as const;
    const auth = await requireAdmin(request);
    if (auth.response) return auth;
    try {
        const path = new URL(request.url).pathname;
        await AdminAuditLog.create({
            actorId: auth.session.userId,
            actorName: auth.session.name,
            action: `${request.method} ${path}`,
            method: request.method,
            path,
        });
        return auth;
    } catch (error) {
        console.error("Admin audit record failed:", error);
        return {
            session: null,
            response: Response.json({ success: false, error: "Admin audit service is temporarily unavailable." }, { status: 503 }),
        } as const;
    }
}

export function adminSessionCookie(token: string): string {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

export function clearAdminSessionCookie(): string {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
