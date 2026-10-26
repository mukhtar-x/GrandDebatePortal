import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeEmail, normalizeString, recursiveSanitize, stripHtml } from "../src/lib/validation";
import { calculatePricing } from "../src/lib/pricing";
import { DEFAULT_COMMITTEE_OPTIONS } from "../src/lib/committeeDefaults";
import Application from "../src/models/Application";
import Delegate from "../src/models/Delegate";
import Payment from "../src/models/Payment";

let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
    try {
        await run();
        passed += 1;
        console.info(`PASS ${name}`);
    } catch (error) {
        failed += 1;
        console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
    }
}

function assertPricing(date: string, delegateCount: number, fee: number, rateType: string): void {
    const result = calculatePricing(delegateCount, new Date(date));
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.pricing.totalPayable, fee);
    assert.equal(result.pricing.rateType, rateType);
}

async function main(): Promise<void> {
await test("pricing: early-bird deadline (7 November, PKT)", () => {
    assertPricing("2026-11-07T23:59:59.999+05:00", 1, 2000, "Early bird");
});
await test("pricing: regular starts 8 November and ends 15 November (PKT)", () => {
    assertPricing("2026-11-08T00:00:00.000+05:00", 1, 2400, "Regular");
    assertPricing("2026-11-15T23:59:59.999+05:00", 4, 9600, "Regular");
});
await test("pricing: registration closes 16 November (PKT)", () => {
    const result = calculatePricing(1, new Date("2026-11-16T00:00:00.000+05:00"));
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.code, "REGISTRATION_CLOSED");
});
await test("input normalization: trims names and lowercases emails", () => {
    assert.equal(normalizeString("  John Doe  "), "John Doe");
    assert.equal(normalizeEmail(" TEST@EXAMPLE.COM "), "test@example.com");
});
await test("input normalization: strips raw HTML and script tags", () => {
    assert.equal(stripHtml("<script>alert('xss')</script> John Doe "), "John Doe");
    assert.equal(stripHtml("<b>Safe Text</b>"), "Safe Text");
    assert.equal(stripHtml("<iframe src='evil.com'></iframe>Fast"), "Fast");

    const payload = {
        fullName: " <script>alert(1)</script>Amina Demo ",
        institution: " FAST-NUCES <b>Karachi</b> ",
        email: " AMINA.DEMO@EXAMPLE.COM ",
        delegates: [
            { fullName: " <h1>Delegate 1</h1> ", email: " D1@TEST.COM " },
        ],
    };
    const sanitized = recursiveSanitize(payload);
    assert.equal(sanitized.fullName, "Amina Demo");
    assert.equal(sanitized.institution, "FAST-NUCES Karachi");
    assert.equal(sanitized.email, "AMINA.DEMO@EXAMPLE.COM");
    assert.equal(sanitized.delegates[0].fullName, "Delegate 1");
    assert.equal(normalizeEmail(sanitized.email), "amina.demo@example.com");
});
await test("study guides: placeholder PDFs exist and are valid PDF-1.4 files", () => {
    const requiredPdfs = [
        "public/docs/committees/unsc-study-guide.pdf",
        "public/docs/committees/disec-study-guide.pdf",
        "public/docs/committees/sochum-study-guide.pdf",
        "public/docs/committees/unwomen-study-guide.pdf",
        "public/docs/committees/pna-study-guide.pdf",
        "public/docs/event-rulebook.pdf",
    ];
    for (const relPath of requiredPdfs) {
        const fullPath = path.join(process.cwd(), relPath);
        assert.ok(fs.existsSync(fullPath), `Missing PDF: ${relPath}`);
        const buf = fs.readFileSync(fullPath);
        assert.ok(buf.length > 500, `PDF too small: ${relPath}`);
        const header = buf.subarray(0, 8).toString("utf8");
        assert.ok(header.startsWith("%PDF-"), `Invalid PDF header in ${relPath}: ${header}`);
    }
});
await test("committeeDefaults: references correct relative public URLs", () => {
    const expectedUrls: Record<string, string> = {
        UNSC: "/docs/committees/unsc-study-guide.pdf",
        DISEC: "/docs/committees/disec-study-guide.pdf",
        SOCHUM: "/docs/committees/sochum-study-guide.pdf",
        "UN Women": "/docs/committees/unwomen-study-guide.pdf",
        PNA: "/docs/committees/pna-study-guide.pdf",
    };
    for (const committee of DEFAULT_COMMITTEE_OPTIONS) {
        assert.equal(
            committee.studyGuideUrl,
            expectedUrls[committee.code],
            `Mismatch for committee ${committee.code}`,
        );
    }
});
await test("schema indexes: compound and unique indexes are defined on models", () => {
    const delegateIndexes = Delegate.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
    const hasCompound = delegateIndexes.some(
        ([fields]) => fields.applicationId === 1 && fields.email === 1,
    );
    assert.ok(hasCompound, "Delegate schema must define compound index [applicationId, email].");

    const appIndexes = Application.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
    const hasAppUnique = appIndexes.some(
        ([fields, options]) => fields.applicationId === 1 && options?.unique === true,
    );
    assert.ok(hasAppUnique, "Application schema must define unique index on applicationId.");

    const paymentIndexes = Payment.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
    const hasPaymentUnique = paymentIndexes.some(
        ([fields, options]) => fields.applicationId === 1 && options?.unique === true,
    );
    assert.ok(hasPaymentUnique, "Payment schema must define unique index on applicationId.");
});
await test("input validation: rejects invalid pricing/delegate counts", () => {
    for (const count of [0, 2, 3, 8]) {
        const result = calculatePricing(count, new Date("2026-10-25T12:00:00.000+05:00"));
        assert.equal(result.success, false, `Expected ${count} delegates to be rejected.`);
    }
});

const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
let serverAvailable = true;
try {
    await fetch(`${baseUrl}/api/committees`, { signal: AbortSignal.timeout(5000) });
} catch (error) {
    serverAvailable = false;
    skipped += 1;
    console.warn(
        `SKIP HTTP integration tests: ${baseUrl} is unavailable (${error instanceof Error ? error.message : error}).`,
    );
}

if (serverAvailable) {
    await test("GET /api/committees returns committee array with fallback data", async () => {
        const response = await fetch(`${baseUrl}/api/committees`);
        assert.equal(response.status, 200);
        const body: unknown = await response.json();
        assert.ok(typeof body === "object" && body !== null);
        const committees = (body as { committees?: unknown }).committees;
        assert.ok(Array.isArray(committees));
        assert.deepEqual(
            new Set(committees.map((committee: { code: string }) => committee.code)),
            new Set(["UNSC", "DISEC", "SOCHUM", "UN Women", "PNA"]),
        );
    });

    await test("Admin APIs reject unauthenticated dashboard and export requests", async () => {
        const requests: Array<{ url: string; init?: RequestInit }> = [
            { url: `${baseUrl}/api/admin/overview` },
            { url: `${baseUrl}/api/admin/export` },
            { url: `${baseUrl}/api/admin/receipts/check-pending`, init: { method: "POST" } },
        ];
        for (const request of requests) {
            const response = await fetch(request.url, request.init);
            assert.equal(response.status, 401, `${request.url} should require an admin session.`);
        }
    });

    await test("Receipt replacement is not exposed as an admin upload endpoint", async () => {
        const response = await fetch(`${baseUrl}/api/admin/payments/TGD-2026-TEST/receipt`, {
            method: "POST",
            body: new FormData(),
        });
        assert.ok(
            response.status === 404 || response.status === 409,
            `Expected a missing-route response, received ${response.status}.`,
        );
    });

    let databaseAvailable = false;
    let databaseProbeStatus = 0;
    try {
        const response = await fetch(`${baseUrl}/api/status`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "nobody@example.invalid", applicationId: "TGD-2026-TEST-NOT-FOUND" }),
        });
        databaseProbeStatus = response.status;
        databaseAvailable = response.status === 404;
    } catch (error) {
        console.warn(`Could not determine database readiness: ${error instanceof Error ? error.message : error}`);
    }

    if (databaseAvailable) {
        const seededEmail = process.env.TEST_STATUS_EMAIL ?? "amina.solo@example.com";
        const seededApplicationId = process.env.TEST_STATUS_APPLICATION_ID ?? "TGD-2026-SEED-SOLO";
        await test("POST /api/status returns status for a valid seeded application", async () => {
            const response = await fetch(`${baseUrl}/api/status`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: seededEmail, applicationId: seededApplicationId }),
            });
            assert.equal(response.status, 200);
            const body: unknown = await response.json();
            assert.match(JSON.stringify(body), /"success":true/);
        });

        await test("POST /api/status returns not-found for unknown credentials", async () => {
            assert.equal(databaseProbeStatus, 404);
        });

        await test("POST /api/status/receipt handles a receipt not currently required", async () => {
            const form = new FormData();
            form.set("email", seededEmail);
            form.set("applicationId", seededApplicationId);
            const response = await fetch(`${baseUrl}/api/status/receipt`, { method: "POST", body: form });
            assert.equal(response.status, 409);
        });

        if (process.env.RUN_ADMIN_CRUD_TESTS === "1" && process.env.TEST_ADMIN_USER_ID && process.env.TEST_ADMIN_PASSWORD) {
        await test("Admin CRUD: can update and verify committee and application in database", async () => {
            const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: baseUrl },
                body: JSON.stringify({ userId: process.env.TEST_ADMIN_USER_ID, password: process.env.TEST_ADMIN_PASSWORD }),
            });
            assert.equal(loginRes.status, 200);
            const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
            assert.ok(cookie);

            const patchRes = await fetch(`${baseUrl}/api/admin/committees/UNSC`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Origin: baseUrl, Cookie: cookie },
                body: JSON.stringify({
                    name: "United Nations Security Council",
                    agenda: "High-Consequence Diplomatic Resolution",
                    suitedTo: "Advanced delegates",
                    level: "Experienced",
                    totalSeats: 55,
                    studyGuideUrl: "/docs/committees/unsc-study-guide.pdf",
                }),
            });
            assert.equal(patchRes.status, 200);
            const patchData = (await patchRes.json()) as { success: boolean; committee?: { agenda: string; totalSeats: number } };
            assert.equal(patchData.success, true);
            assert.equal(patchData.committee?.agenda, "High-Consequence Diplomatic Resolution");
            assert.equal(patchData.committee?.totalSeats, 55);

            const appPatchRes = await fetch(`${baseUrl}/api/admin/applications/TGD-2026-SEED-SOLO`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Origin: baseUrl, Cookie: cookie },
                body: JSON.stringify({
                    institution: "FAST NUCES Karachi Main Campus",
                    status: "Payment under review",
                }),
            });
            assert.equal(appPatchRes.status, 200);
            const appPatchData = (await appPatchRes.json()) as { success: boolean; application?: { institution: string; status: string } };
            assert.equal(appPatchData.success, true);
            assert.equal(appPatchData.application?.institution, "FAST NUCES Karachi Main Campus");
            assert.equal(appPatchData.application?.status, "Payment under review");
        });
        } else {
            skipped += 1;
            console.info("SKIP admin CRUD writes (set RUN_ADMIN_CRUD_TESTS=1 and TEST_ADMIN_USER_ID/TEST_ADMIN_PASSWORD for a development admin account).");
        }
    } else {
        skipped += 3;
        console.info("SKIP database-backed status/receipt checks (the API server is up, but MongoDB is unavailable).");
    }

    for (const [type, count, expectedMessage] of [
        ["solo", 0, "exactly one"],
        ["delegation", 0, "between 4 and 7"],
        ["delegation", 3, "between 4 and 7"],
        ["delegation", 8, "between 4 and 7"],
    ] as const) {
        await test(`POST /api/register rejects ${type} with ${count} delegates`, async () => {
            const form = new FormData();
            form.set(
                "payload",
                JSON.stringify({
                    participantType: type,
                    institution: "Integration Test University",
                    delegates: Array.from({ length: count }, () => ({})),
                }),
            );
            const response = await fetch(`${baseUrl}/api/register`, { method: "POST", body: form });
            assert.equal(response.status, 400);
            const body: unknown = await response.json();
            assert.match(JSON.stringify(body), new RegExp(expectedMessage, "i"));
        });
    }

    await test("POST /api/status/receipt rejects missing credentials", async () => {
        const form = new FormData();
        const response = await fetch(`${baseUrl}/api/status/receipt`, { method: "POST", body: form });
        assert.equal(response.status, 400);
    });

    if (process.env.RUN_WRITE_TESTS === "1" && databaseAvailable) {
        const localHost = new URL(baseUrl).hostname;
        if (!["localhost", "127.0.0.1", "::1"].includes(localHost) && process.env.ALLOW_REMOTE_WRITE_TESTS !== "1") {
            throw new Error("Refusing write-enabled tests against a remote host. Set ALLOW_REMOTE_WRITE_TESTS=1 explicitly.");
        }
        const unique = Date.now().toString();
        const pngBytes = Uint8Array.from(
            Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY4sAAAAASUVORK5CYII=",
                "base64",
            ),
        );

        for (const participantType of ["solo", "delegation"] as const) {
            await test(`POST /api/register accepts a valid ${participantType} application`, async () => {
                const delegates = participantType === "solo" ? 1 : 4;
                const baseEmail = `api-${unique}-${participantType}`;
                const delegateEntries = Array.from({ length: delegates }, (_, index) => ({
                    fullName: index === 0 ? "  John Doe  " : `Test Delegate ${index + 1}`,
                    email: `${baseEmail}-${index + 1}@example.com`.toUpperCase(),
                    whatsappNumber: `+9230012345${String(index).padStart(2, "0")}`,
                    experienceLevel: "None",
                    firstPreference: "UNSC",
                    secondPreference: "DISEC",
                }));
                const form = new FormData();
                form.set(
                    "payload",
                    JSON.stringify({
                        participantType,
                        institution: "Integration Test University",
                        delegates: delegateEntries,
                        headName: "Test Head",
                        headEmail: `${baseEmail}-1@example.com`,
                        headWhatsapp: "+923001234500",
                        headIsDelegate: participantType === "delegation",
                        idempotencyKey: `api-test-${unique}-${participantType}`,
                    }),
                );
                form.set("receipt", new Blob([pngBytes], { type: "image/png" }), "receipt.png");
                const response = await fetch(`${baseUrl}/api/register`, { method: "POST", body: form });
                assert.ok(response.status === 201 || response.status === 200, `Unexpected HTTP ${response.status}`);
                const body = (await response.json()) as { success?: boolean; applicationId?: string; firstName?: string };
                assert.equal(body.success, true);
                assert.equal(body.firstName, participantType === "solo" ? "John" : "Test");
                assert.equal(typeof body.applicationId, "string");
                const statusResponse = await fetch(`${baseUrl}/api/status`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ email: `${baseEmail}-1@example.com`, applicationId: body.applicationId }),
                });
                assert.equal(statusResponse.status, 200);
            });
        }
    } else if (process.env.RUN_WRITE_TESTS === "1") {
        skipped += 1;
        console.info("SKIP valid registration writes because MongoDB is unavailable.");
    } else {
        skipped += 1;
        console.info("SKIP valid registration writes (set RUN_WRITE_TESTS=1 to write isolated development records).");
    }
}

console.info(`\nAPI test summary: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
    console.error("API test runner failed:", error);
    process.exitCode = 1;
});
