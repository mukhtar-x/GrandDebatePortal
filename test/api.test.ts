import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { normalizeEmail, normalizeString, recursiveSanitize, stripHtml } from "../src/lib/validation";
import { calculatePricing } from "../src/lib/pricing";
import { getChallanDetails, registrationFingerprint, reusableChallanFilter, CHALLAN_ISSUE_ORDER } from "../src/lib/challans";
import { parseRegistrationDetails } from "../src/lib/registrationInput";
import { consumeRateLimit } from "../src/lib/rateLimit";
import ChallanIssue, { challanIssueStatus } from "../src/models/ChallanIssue";
import { DEFAULT_COMMITTEE_OPTIONS } from "../src/lib/committeeDefaults";
import { COMMITTEE_DETAILS } from "../src/data/committee-details";
import { RULEBOOK_PATH, RULEBOOK_PUBLISHED, STUDY_GUIDES_PUBLISHED } from "../src/data/event";
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
await test("pricing: early-bird deadline (12 November, PKT)", () => {
    assertPricing("2026-11-12T23:59:59.999+05:00", 1, 2000, "Early bird");
});
await test("pricing: regular starts 13 November and ends 18 November (PKT)", () => {
    assertPricing("2026-11-13T00:00:00.000+05:00", 1, 2400, "Regular");
    assertPricing("2026-11-18T23:59:59.999+05:00", 4, 4 * 2400 + 500, "Regular");
});
await test("pricing: delegations pay a single PKR 500 delegation fee", () => {
    assertPricing("2026-11-05T12:00:00.000+05:00", 7, 7 * 2000 + 500, "Early bird");
    assertPricing("2026-11-05T12:00:00.000+05:00", 1, 2000, "Early bird");
});
await test("pricing: registration closes 19 November (PKT)", () => {
    const result = calculatePricing(1, new Date("2026-11-19T00:00:00.000+05:00"));
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
await test("delegate resources: published PDFs are real files; unpublished ones are not shipped", () => {
    const guides = COMMITTEE_DETAILS.flatMap(({ studyGuideHref }): string[] => (studyGuideHref ? [studyGuideHref] : []));
    const resources = [
        ...guides.map((href) => ({ href, published: STUDY_GUIDES_PUBLISHED })),
        { href: RULEBOOK_PATH, published: RULEBOOK_PUBLISHED },
    ];
    for (const { href, published } of resources) {
        const fullPath = path.join(process.cwd(), "public", href);
        if (published) {
            assert.ok(fs.existsSync(fullPath), `Published PDF is missing: ${href}`);
            const buf = fs.readFileSync(fullPath);
            assert.ok(buf.subarray(0, 5).toString("utf8") === "%PDF-", `Invalid PDF header in ${href}`);
            // The old placeholders were under 1 KB; a real guide is far larger.
            assert.ok(buf.length > 10 * 1024, `PDF looks like an empty placeholder: ${href}`);
        } else {
            assert.ok(!fs.existsSync(fullPath), `Unpublished PDF should not be downloadable: ${href}`);
        }
    }
});
await test("committeeDefaults: references correct relative public URLs", () => {
    const expectedUrls: Record<string, string | undefined> = {
        UNSC: "/docs/committees/unsc-study-guide.pdf",
        DISEC: "/docs/committees/disec-study-guide.pdf",
        PAC: undefined,
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
    assert.equal(Application.schema.path("baCode")?.options.type, String);
    assert.equal(Application.schema.path("baCode")?.options.maxlength, 50);
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

const ACTIVE_CODES = new Set(DEFAULT_COMMITTEE_OPTIONS.map(({ code }) => code));
const validSolo = () => ({
    participantType: "solo",
    institution: " FAST-NUCES ",
    delegates: [{
        fullName: " Amina Demo ",
        email: " AMINA@EXAMPLE.COM ",
        whatsappNumber: "+92 300 1234567",
        experienceLevel: "None",
        firstPreference: "unsc",
        secondPreference: "DISEC",
    }],
});

await test("registration details: normalises a valid solo registration", () => {
    const result = parseRegistrationDetails(validSolo(), ACTIVE_CODES);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.value.institution, "FAST-NUCES");
    assert.equal(result.value.contact.email, "amina@example.com");
    assert.equal(result.value.delegates[0].firstPreference, "UNSC");
});
await test("registration details: rejects what registration would later refuse", () => {
    const samePreference = validSolo();
    samePreference.delegates[0].secondPreference = "UNSC";
    const result = parseRegistrationDetails(samePreference, ACTIVE_CODES);
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.field, "delegates[0].secondPreference");

    const unknownCommittee = validSolo();
    unknownCommittee.delegates[0].firstPreference = "SOCHUM";
    assert.equal(parseRegistrationDetails(unknownCommittee, ACTIVE_CODES).success, false);
});
await test("challan fingerprint: same details match, any change does not", () => {
    const first = parseRegistrationDetails(validSolo(), ACTIVE_CODES);
    const retyped = parseRegistrationDetails({ ...validSolo(), institution: "FAST-NUCES" }, ACTIVE_CODES);
    const changed = parseRegistrationDetails({ ...validSolo(), institution: "Another School" }, ACTIVE_CODES);
    assert.ok(first.success && retyped.success && changed.success);
    if (!first.success || !retyped.success || !changed.success) return;
    assert.equal(registrationFingerprint(first.value), registrationFingerprint(retyped.value));
    assert.notEqual(registrationFingerprint(first.value), registrationFingerprint(changed.value));
});
await test("challan details: category and amount include the delegation fee", () => {
    const solo = getChallanDetails("solo", 1, new Date("2026-11-05T12:00:00+05:00"));
    assert.equal(solo?.category, "solo");
    assert.equal(solo?.totalPayable, 2000);
    const delegation = getChallanDetails("delegation", 5, new Date("2026-11-14T12:00:00+05:00"));
    assert.equal(delegation?.category, "delegation-5");
    assert.equal(delegation?.totalPayable, 5 * 2400 + 500);
    assert.equal(getChallanDetails("delegation", 3), null);
    assert.equal(getChallanDetails("solo", 1, new Date("2026-11-19T00:00:00+05:00")), null);
});
await test("challan reuse: unused first, grace period respected, expiry after 30 minutes", () => {
    assert.deepEqual(Object.keys(CHALLAN_ISSUE_ORDER), ["issueCount", "graceUntil", "challanNumber"]);
    const now = new Date("2026-11-05T12:00:00+05:00");
    const filter = reusableChallanFilter(now);
    assert.deepEqual(filter.$or[0], { status: "Available" });
    assert.deepEqual(filter.$or[1], { status: { $in: ["Reserved", "Expired"] }, graceUntil: { $lte: now } });
    assert.equal(challanIssueStatus({ status: "Active", expiresAt: new Date(now.getTime() - 1) }, now), "Expired");
    assert.equal(challanIssueStatus({ status: "Active", expiresAt: new Date(now.getTime() + 1) }, now), "Active");
    assert.equal(challanIssueStatus({ status: "Submitted", expiresAt: new Date(now.getTime() - 1) }, now), "Submitted");
    const issueIndexes = ChallanIssue.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
    assert.ok(issueIndexes.some(([fields]) => fields.challanNumber === 1 && fields.reservedAt === 1));
    assert.ok(Payment.schema.path("otherChallanNumbers"), "Payment must record earlier challan numbers.");
});
await test("rate limit: fails closed without its store; the in-memory layer still counts", async () => {
    // This suite runs without MongoDB, so every call reaches the "store unavailable" path.
    const key = `test-memory-${Date.now()}`;
    const originalError = console.error;
    console.error = () => {};
    try {
        const first = await consumeRateLimit(key, 2, 60_000);
        assert.equal(first.allowed, false, "Requests must be refused when limits cannot be enforced.");
        assert.equal(first.unavailable, true);
        await consumeRateLimit(key, 2, 60_000);
        const third = await consumeRateLimit(key, 2, 60_000);
        assert.equal(third.allowed, false);
        assert.equal(third.unavailable, undefined, "Past the limit, the in-memory layer refuses before the store is tried.");
        assert.ok(third.retryAfterSeconds > 0);
    } finally {
        console.error = originalError;
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
            new Set(["UNSC", "DISEC", "PAC", "UN Women", "PNA"]),
        );
    });

    await test("Admin APIs reject unauthenticated dashboard and export requests", async () => {
        const requests: Array<{ url: string; init?: RequestInit }> = [
            { url: `${baseUrl}/api/admin/overview` },
            { url: `${baseUrl}/api/admin/brand-ambassadors` },
            { url: `${baseUrl}/api/admin/committees` },
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

    await test("POST /api/register rejects an overlong BA Code", async () => {
        const form = new FormData();
        form.set(
            "payload",
            JSON.stringify({
                participantType: "solo",
                institution: "Integration Test University",
                baCode: "A".repeat(51),
                delegates: [{}],
            }),
        );
        const response = await fetch(`${baseUrl}/api/register`, { method: "POST", body: form });
        assert.equal(response.status, 400);
        const body: unknown = await response.json();
        assert.match(JSON.stringify(body), /BA Code is invalid or too long/i);
        assert.match(JSON.stringify(body), /"field":"baCode"/);
    });

    await test("POST /api/register requires a reserved challan", async () => {
        const form = new FormData();
        form.set("payload", JSON.stringify({ ...validSolo(), idempotencyKey: `api-test-${Date.now()}` }));
        const response = await fetch(`${baseUrl}/api/register`, { method: "POST", body: form });
        assert.equal(response.status, 400);
        assert.match(JSON.stringify(await response.json()), /"field":"reservationToken"/);
    });

    await test("POST /api/challans/reserve validates details before issuing a challan", async () => {
        const invalid = validSolo();
        invalid.delegates[0].secondPreference = "UNSC";
        const response = await fetch(`${baseUrl}/api/challans/reserve`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ registration: invalid, draftId: `api-test-${Date.now()}` }),
        });
        assert.equal(response.status, 400);
        assert.match(JSON.stringify(await response.json()), /secondPreference/);
    });

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
        // A real image: the receipt validator decodes and re-encodes every upload.
        const pngBytes = Uint8Array.from(
            await sharp({ create: { width: 400, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer(),
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
                const draftId = `api-test-${unique}-${participantType}`;
                const details = {
                    participantType,
                    institution: "Integration Test University",
                    delegates: delegateEntries,
                    headName: "Test Head",
                    headEmail: `${baseEmail}-1@example.com`,
                    headWhatsapp: "+923001234500",
                    headIsDelegate: participantType === "delegation",
                };
                const reserve = async (registration: typeof details, previousReservationToken?: string) => {
                    const response = await fetch(`${baseUrl}/api/challans/reserve`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ registration, draftId, previousReservationToken }),
                    });
                    return { status: response.status, body: (await response.json()) as { reservationToken?: string; challanNumber?: string; resumed?: boolean; code?: string } };
                };

                const first = await reserve({ ...details, institution: "Integration Test College" });
                assert.equal(first.status, 200, JSON.stringify(first.body));
                const resumed = await reserve({ ...details, institution: "Integration Test College" });
                assert.equal(resumed.body.challanNumber, first.body.challanNumber, "Same details must resume the same challan.");
                assert.equal(resumed.body.resumed, true);
                const held = await reserve(details);
                assert.equal(held.status, 409, "Different details without the previous token must not take a second challan.");
                assert.equal(held.body.code, "CHALLAN_HELD");
                const replaced = await reserve(details, resumed.body.reservationToken);
                assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
                assert.notEqual(replaced.body.challanNumber, first.body.challanNumber);

                const form = new FormData();
                form.set(
                    "payload",
                    JSON.stringify({ ...details, idempotencyKey: draftId, reservationToken: replaced.body.reservationToken }),
                );
                form.set("receipt", new Blob([pngBytes], { type: "image/png" }), "receipt.png");
                const response = await fetch(`${baseUrl}/api/register`, { method: "POST", body: form });
                assert.ok(response.status === 201 || response.status === 200, `Unexpected HTTP ${response.status}`);
                const body = (await response.json()) as { success?: boolean; applicationId?: string; firstName?: string; challanNumber?: string };
                assert.equal(body.success, true);
                assert.equal(body.challanNumber, replaced.body.challanNumber);
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
