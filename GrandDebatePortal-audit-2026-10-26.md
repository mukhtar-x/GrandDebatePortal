# GrandDebatePortal: Codebase Audit

**Branch:** `feature/latest-version-compiled` @ `70317d6`
**Date:** 2026-10-26
**Scope:** UI/UX, security, backend and data integrity. Audit only; no repository files were changed.

---

## A. Executive summary

**Verdict: not ready for production.** The codebase is well-engineered for its size: typecheck, lint and the dependency audit are clean, admin routes are consistently authenticated, and pricing is computed on the server. But four problems block a real launch:

1. **Nobody can register legitimately.** The form requires a payment screenshot, yet the payment details are deliberately unpublished. The page tells users "do not transfer money using unofficial details" (`src/lib/paymentDetails.ts`: `confirmed: false`).
2. **Applicants can easily lose their application ID.** No email is ever sent, the ID appears only once on the confirmation screen, and the form tells users their ID "will be sent to this address."
3. **The database allows duplicate registrations and seat overbooking under concurrency.** Duplicate-email checks and seat limits are check-then-write with no unique indexes behind them.
4. **A 25 MB screen capture of a developer's desktop is committed and pushed** (the root file `mongoose`). Its contents are unknown.

**Strongest parts:** HMAC-signed `HttpOnly`/`SameSite=Strict` admin session, timing-safe compares, receipts never public (served with a sandbox CSP), images re-encoded to strip metadata, CSV formula-injection guard, regex-escaped search, multi-document writes in transactions, and 64-bit random application IDs.

---

## B. Scope and baseline

| Item | Finding |
|---|---|
| Branch / commit | `feature/latest-version-compiled` @ `70317d6` |
| Working tree | Clean before and after the audit. No repo files changed. |
| Existing build artifact | `.next/` (BUILD_ID dated 2026-10-25 06:29) is **stale**. It has no `/admin`, `/api/committees`, `/api/admin/overview` or `/api/admin/committees`, so it matches roughly `40c568c`/`0b2ed17`, two commits behind HEAD. |
| Latest known-good build | **HEAD `70317d6`.** Verified by building a `git archive` copy outside the repo: 27 routes, exit 0. |
| Source vs compiled | HEAD source and the fresh build match. The in-repo `.next` does not match HEAD. |
| Inspected | Every tracked source file: models, all 23 route handlers, all libraries, all components and pages, `proxy.ts`, config, seed script, tests and README. CSS was scanned selectively, not line by line. |
| Not inspected | The contents of the `mongoose` screen capture (deliberately not rendered), visual rendering in a browser at different viewports (no browser tooling), and real MongoDB behaviour (no database available). |

---

## C. Findings dashboard

| ID | Priority | Severity | Domain | Finding | Confidence |
|---|---|---|---|---|---|
| UX-1 | **P0*** | High | UI/UX / business | Receipt is required but payment details aren't published | Confirmed (live HTML) |
| SEC-1 | **P0** | Unknown → High | Security | Developer screen capture committed and pushed (`mongoose`) | Confirmed artifact, contents unknown |
| REL-1 | **P1** | High | Reliability / UX | No email delivery; application ID can be lost; UI promises email | Confirmed |
| DB-1 | **P1** | High | Database | Duplicate registrations: check-then-insert race, no unique index on email or idempotency key | Confirmed by code |
| SEC-2 | **P1** | Medium | Security | Rate limiter fails open and is keyed on the client-controlled `X-Forwarded-For` | Confirmed (live) |
| SEC-3 | **P1** | Medium | Security | Single shared admin password; self-declared reviewer name; no revocation or audit log | Confirmed |
| DB-2 | **P1** | Medium | Database | Seat overbooking and duplicate portfolios under concurrent allocation | Confirmed by code |
| BE-1 | **P2** | Medium | Backend | Committee lifecycle bugs (can't reactivate, deleted defaults come back, frontend list hardcoded) | Confirmed by code |
| BE-2 | **P2** | Medium | Backend | Admin PATCH can set any status, bypassing the payment workflow | Confirmed |
| BE-3 | **P2** | Medium | Data / privacy | Deleting an application leaves receipt files (PII) orphaned | Confirmed |
| REL-2 | **P2** | Medium | Reliability | Batch OCR can run past `maxDuration`; timeouts don't cancel OCR | Confirmed by code |
| TEST-1 | **P2** | Medium | Testing | Integration test writes to the DB without the write guard and hard-codes an admin password | Confirmed |
| UX-2 | **P2** | Medium | UI/UX | Intro overlay up to 18 s on every full page load, including `/portal` | Confirmed (live HTML) |
| UX-3 | **P2** | Medium | Accessibility | 9–11 px text, failing contrast in admin, weak form focus indicator | Confirmed (computed) |
| UX-4 | **P2** | Low | UI/UX / content | Archive contradicts itself; study guides are about 800-byte placeholders | Confirmed |
| SEC-4 | **P3** | Low | Security | No CSP on app pages; `X-Powered-By` exposed | Confirmed (live) |
| SEC-5 | **P3** | Low | Security / privacy | Email-registration lookup via 409 `ALREADY_REGISTERED` | Confirmed by code |
| BE-4 | **P3** | Low | Backend | Status inconsistencies; dead honeypot check; seed script has no environment guard | Confirmed |
| UX-5 | **P3** | Low | UI/UX | WhatsApp `pattern` invalid under the `v` flag, silently ignored | Confirmed (node test) |
| UX-6 | **P3** | Low | UI/UX | No client-side file checks; shrinking a delegation silently drops entries; admin UX gaps | Confirmed |
| PERF-1 | **P3** | Low | Performance | About 3 MB of video on first visit; admin search makes 3 calls per keystroke; repo bloat | Confirmed |
| SEC-6 | — | Info | Security | Origin check trusts `X-Forwarded-Host` (not exploitable from browsers) | Confirmed (live) |
| BLD-1 | — | Info | Build | In-repo `.next` is stale and would serve an old app without `/admin` | Confirmed |

\*UX-1 is P0 if registration is meant to be open now. Early-bird pricing ends 7 November 2026.

---

## D. Detailed findings

### Security

#### SEC-1: Screen capture committed to the repo (P0, contents unverified)

- **What:** The tracked root file `mongoose` (25.6 MB, added in `70317d6` and pushed to origin) is a PostScript file whose header reads `%%Creator: (ImageMagick)`. It has 3 pages of 1600×868 and was created 2026-10-25T08:29Z.
- **Cause:** This is what ImageMagick's `import` command produces. It happens when `import mongoose from "mongoose"` is typed into a shell instead of a file: the command grabs the screen.
- **Impact:** Anything on that screen, such as `.env` contents, a DB connection string or applicant data, is now in git history.
- **Fix:** View it privately. Delete it from the tree. If it shows any credential, rotate that credential and purge it from history (`git filter-repo`), since a normal delete leaves it in history.
- **Verify:** `git log --all -- mongoose` returns nothing after the purge.

#### SEC-2: Rate limiting fails open and can be bypassed (P1, Medium)

- **Where:** `src/lib/rateLimit.ts:47-50` returns `allowed: true` on any DB error. `src/lib/requestGuards.ts:1-8` trusts the first `X-Forwarded-For` value.
- **Verified live:** With MongoDB unreachable, 14 wrong-password logins all reached the password check (no 429), and the server logged "allowing request" 19 times.
- **Exploit:** Unless the hosting proxy overwrites `X-Forwarded-For`, an attacker sends a new value per request and gets unlimited tries against the single admin password on `/api/admin/login`. Registration spam works the same way.
- **Fix:** Fail closed for `admin-login`. Derive the client IP from a trusted, platform-specific header. Add a global (not per-IP) login limit.
- **Regression test:** 11 logins with rotating `X-Forwarded-For` values must produce a 429.

#### SEC-3: One shared admin identity (P1, Medium)

- **What:** Everyone shares `ADMIN_PASSWORD`. The organiser types their own name at login, and that name is stored as `reviewedBy` without any verification.
- **Revocation:** Logout only clears the cookie. The token stays valid for 12 h, and the only way to revoke it is to rotate the password.
- **Audit:** There is no log for `DELETE /api/admin/applications/:id`.
- **Impact:** Payment confirmations can't be attributed. A leaked password exposes every applicant's PII and receipts.
- **Fix:** Per-organiser accounts (or an allowlisted OAuth provider), a server-side session or revocation store, and an append-only audit log for confirm, reject, allocate and delete.

#### SEC-4: Missing hardening headers (P3, Low)

- No `Content-Security-Policy` on HTML pages, and `X-Powered-By: Next.js` is sent (both verified live).
- **Fix:** Add a CSP (nonce-based or strict `self`) and set `poweredByHeader: false`.

#### SEC-5: Email-registration lookup (P3, Low)

- `src/app/api/register/route.ts:323-335` returns 409 `ALREADY_REGISTERED` before the receipt is validated.
- So anyone can check whether a given email (possibly a school student's) is registered with a tiny request.
- **Fix:** Validate the receipt first, or return a generic message and notify the owner by email once email works.

#### SEC-6: Origin check trusts `X-Forwarded-Host` (Info)

- Sending `Origin: evil` plus `X-Forwarded-Host: evil` passes the check (verified).
- Browsers can't set that header cross-site without a CORS preflight, and the admin cookie is `SameSite=Strict`, so this is not exploitable for CSRF. It just shouldn't be trusted.

#### Other security notes

- PDF receipt screening is a regex (`src/lib/receipts/validate.ts:9`) that hex-escaped names can bypass. The risk is low because PDFs are served as attachments under a sandbox CSP, to admins only.
- The optional AI check sends receipts to a third party. That needs an applicant-facing privacy notice.

### Database and backend

#### DB-1: Duplicate registrations (P1, High)

- `Delegate.exists({ email: { $in } })` at `src/app/api/register/route.ts:323` runs **outside** the transaction.
- `Delegate.email` has never had a unique index (checked through git history). `Application.idempotencyKey` isn't indexed at all (`src/models/Application.ts:48`).
- MongoDB snapshot transactions don't stop this write skew, because the two requests insert different documents.
- **Impact:** Two concurrent submits with the same emails (two tabs, a retry, a script) create two applications. That means two payments to reconcile and double-counted delegates.
- **Fix:** Add a unique index on `Delegate.email` (decide first whether one email may appear in several applications) and a unique sparse index on `idempotencyKey`. Then map E11000 errors to 409 or replay the original response.
- **Test:** 10 concurrent identical POSTs must create exactly one application.

#### DB-2: Seat overbooking under concurrent allocation (P1, Medium)

- `src/app/api/admin/delegates/[id]/allocate/route.ts:72-93` counts the seats taken, then saves. The portfolio check works the same way.
- Two organisers allocating at the same time can exceed `totalSeats` or assign the same country twice.
- **Fix:** A partial unique index on `{ assignedCommittee, assignedPortfolio }`, plus an atomic seat counter on `Committee` (`findOneAndUpdate` with `$inc` guarded by `allocatedSeats < totalSeats`) inside the transaction.

#### BE-1: Committee lifecycle bugs (P2, Medium)

- **(a)** `canonicalCommittee` only finds *active* committees (`src/lib/committeeOptions.ts:8`). Once a committee is deactivated, `PATCH` returns 404, so it can never be reactivated.
- **(b)** `seedCommittees()` upserts the five defaults on every new process (`src/lib/db.ts:20`), so a deleted default committee comes back after the next cold start.
- **(c)** If every committee is inactive, or the DB is down, the code falls back to the defaults with `active: true`. Verified live: `/api/committees` returned all five with no DB.
- **(d)** The form uses the hardcoded `COMMITTEES` list (`src/data/event.ts:11`) and never calls `/api/committees`. If one is deactivated, users get the misleading error "Please complete this field."

#### BE-2: Admin PATCH bypasses the workflow (P2, Medium)

- `src/app/api/admin/applications/[applicationId]/route.ts:52-76` accepts any status, such as "Committee allocated" while the payment is still Pending.
- It silently drops invalid email or phone values, and returns raw error messages.
- No UI calls this endpoint yet. Restrict it to allowed transitions before anything does.

#### BE-3: Delete leaves receipt files behind (P2, Medium)

- `DELETE` removes the application, delegate and payment documents but not the GridFS receipts (including the `receiptHistory` files).
- The code comment claims "zero orphaned data." Financial screenshots with PII would stay stored indefinitely.

#### REL-2: Batch OCR can overrun the function limit (P2, Medium)

- `src/app/api/admin/receipts/check-pending/route.ts` stops starting new receipts after 40 s, but each OCR may take up to 40 s (`src/lib/receipts/ocr.ts:4`), against `maxDuration = 60`. A batch can therefore be killed mid-write.
- `withTimeout` doesn't terminate the tesseract job, so the worker stays busy for the next call.
- **Fix:** Stop starting items at 60 s minus the OCR timeout, and terminate the worker when a timeout fires.

#### BE-4: Smaller backend issues (P3, Low)

- New applications stay "Submitted" until the `after()` quick check succeeds. If that check fails, nothing retries it.
- Rejecting a payment ignores waitlisted delegates.
- The honeypot check (`src/app/api/register/route.ts:285`) is dead code, because the form never sends a `website` field.
- `scripts/seed.ts` has no production guard, and its `$set` overwrites admin-edited committee seats and agendas.

#### What's correct

- All admin routes require a session (verified 401s, and forged cookies are rejected).
- Mutations check the origin.
- Queries receive type-checked strings, so no NoSQL injection path was found.
- There are no raw HTML sinks (no `dangerouslySetInnerHTML`, `eval` or similar).
- Price is never taken from the client.
- The database lookups use `$lookup`, so there are no N+1 query patterns. `earlierPayments` does scan all payments on each check, which is fine at conference scale.

### UI/UX

#### UX-1: The registration path is blocked (P0 if registration is open)

- `src/components/registration/payment-section.tsx:47-50` says the payment details are "being confirmed… do not transfer," yet the screenshot is `required` both client-side and server-side.
- The `WRONG_RECIPIENT` fraud check is also off while `accountNumber` is null.
- **Fix:** Publish the account details and set `PAYMENT_DETAILS`, or let people register without a receipt and pay later.

#### REL-1: Application IDs get lost (P1, High)

- `src/lib/mailer.ts:31-37` only logs to the console; the README admits this.
- Yet `src/components/registration/solo-delegate-fields.tsx:40` tells users "Your application ID will be sent to this address."
- The portal's only recovery advice is "refer to your confirmation screen." Anyone who closes that tab must contact organisers by hand.
- **Fix:** Before launch, wire up an SMTP or transactional email provider, or at minimum add a "copy/download ID" button and remove the false claim.

#### UX-2: Intro overlay (P2)

- The overlay is server-rendered on `/`, `/portal` and `/register` (verified), locks scrolling, preloads a 1.37 MB video, and runs up to 18 s.
- It plays again on every full page load because nothing remembers it was seen.
- It isn't a dialog, the Skip button isn't focused, and the page behind it stays in the tab order and the screen-reader tree.
- **Fix:** Home page only, remember it with `sessionStorage`, make the page behind it `inert`, and focus the Skip button.

#### UX-3: Accessibility (P2)

- Hints are 9 px (`src/app/globals.css:679`) and much body text is 10–11 px.
- Admin secondary text fails WCAG 1.4.3: `#7d8795` on white is 3.64:1 and `#7a8492` is 3.79:1, at 11 px.
- `.form-control:focus` removes the outline and uses a gold glow at 15% opacity (1.24:1), leaving only a border colour change.
- Admin tabs lack `tabpanel` elements and arrow-key support. The status tracker's `aria-label` sits on a plain `div`, where it isn't announced.

#### UX-4: Archive and study guides (P2)

- "No documents have been uploaded yet" appears directly under an available rulebook and folders saying "1 file available."
- Every study guide is a one-page stub titled "Official Committee Study Guide," and the portal's "Open Study Guide" button leads to it.

#### UX-5 and UX-6: Form details (P3)

- The WhatsApp `pattern` `\+?[0-9\s()-]{10,18}` throws under the `v` flag that current browsers use (verified in Node), so browsers ignore it. The server still validates.
- The file input has no client-side size check (limit 4 MB), and `image/*` lets users pick HEIC files the server rejects.
- Shrinking a delegation silently drops delegates 5–7.
- The admin allocation dropdown only offers the delegate's 1st and 2nd preferences.
- Someone who loads the form before midnight on 7 November and submits after it is charged the regular rate.

#### PERF-1 (P3)

- A first visit to the home page loads about 3 MB of video (the intro plus the logo reveal).
- Admin search fires 3 API calls per keystroke with no debounce.
- `public/` holds about 15 MB of unreferenced assets, plus the 25 MB `mongoose` file in the repo.

### Testing

#### TEST-1 (P2)

- The "Admin CRUD" test (`test/api.test.ts:220-261`) patches the UNSC committee (seats 55, agenda) and an application's status whenever a server and DB are reachable.
- That bypasses the file's own `RUN_WRITE_TESTS` guard, and the test hard-codes an admin password literal.
- Pointed at a staging DB, it would silently change real configuration.
- **Coverage:** 9 unit tests. Nothing covers concurrency, authorization on mutation routes, the UI, or end-to-end flows.

---

## E–G. Assessments

- **UI/UX:** The visual design is cohesive, with consistent tokens and card patterns, and the responsive breakpoints exist at 980, 780, 760 and 580 px (not visually verified). Loading, error and empty states exist for every flow, and double submits are prevented by disabled buttons plus an idempotency key. The verified defects are UX-1 through UX-6. The intro overlay change is a recommendation; the rest are defects.
- **Security:**
  - *Assets:* applicant PII (including students), payment receipts and the organiser console.
  - *Trust boundaries:* the public form and portal API, the admin API, and the optional third-party AI service.
  - *Confirmed weaknesses:* SEC-1 (pending its contents), SEC-2 and SEC-3. No unauthenticated access to admin data, IDOR, injection, or XSS was found.
  - *Unverified:* the hosting proxy's `X-Forwarded-For` behaviour and the real admin password strength.
- **Backend:**
  - Clean layering: routes, then `lib`, then models.
  - Transactions are used correctly for multi-document updates.
  - The weak spot is invariants the schema doesn't enforce (DB-1, DB-2), which transactions alone can't protect.
  - Reliability is mostly good, since emails and checks never fail the request that triggered them. The exceptions are REL-2 and the fail-open limiter.

---

## H. Build and test results

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | ✅ 0 errors |
| `npx eslint .` | ✅ 0 problems |
| `API_BASE_URL=http://127.0.0.1:9 npx tsx test/api.test.ts` | ✅ 9 passed, 1 skipped. Pointed at a dead port so the HTTP tests that write to the DB couldn't run. |
| `npm audit` and `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `next build` on a `git archive HEAD` copy outside the repo | ✅ Exit 0, 27 routes. A first attempt with a linked `node_modules` failed because Turbopack refuses links outside the project root; `node_modules` was copied instead. |
| `next start` on an isolated port with an unreachable DB and a throwaway password | Verified headers, admin 401s, forged-cookie rejection, the cross-origin 403, the rate-limit fail-open, the committee fallback, and the SSR markup. |
| Not run | Anything DB-backed (no MongoDB available), concurrency reproduction, browser and viewport tests, and the write tests. |

---

## I. Prioritized recommendations

1. **Contain now.**
   - Inspect and purge `mongoose`, rotating any credential it shows (SEC-1).
   - Decide the payment flow and publish the account details (UX-1).
   - Remove the false "ID will be emailed" text (REL-1).
2. **Before launch.**
   - Unique indexes on delegate email and idempotency key, plus E11000 handling (DB-1).
   - Atomic seat counter and portfolio index (DB-2).
   - Real email delivery (REL-1).
   - Fail-closed login limit with a trusted IP source (SEC-2).
   - Per-organiser auth and an audit log (SEC-3).
   - Each needs a regression test, for example concurrent POSTs must yield one application and allocations must never exceed seats.
3. **Next.**
   - Committee lifecycle fixes, and drive the form from `/api/committees` (BE-1).
   - PATCH status transitions (BE-2) and receipt cleanup on delete (BE-3).
   - OCR time budget (REL-2) and guarding the CRUD test (TEST-1).
   - Intro overlay and accessibility fixes (UX-2, UX-3) and real study guides (UX-4).
4. **Later.** CSP and `poweredByHeader` (SEC-4), the remaining P3 polish, deleting unused assets and the empty `src/components/hero.ts`, and rebuilding or deleting the stale `.next`.

---

## J. Final verdict

- **Source vs known-good build:** HEAD builds cleanly and is the known-good version. The in-repo `.next` is a stale build of an older commit.
- **Confirmed vulnerabilities:** Yes, the fail-open and spoofable rate limit and the shared-credential admin model. The exposure from the screen capture is unknown until someone views it. No injection, XSS, IDOR or unauthenticated admin access was found.
- **Business rules bypassable by direct API calls:**
  - Duplicate registrations: yes, via concurrent requests.
  - Seat limits: yes, via concurrent admin requests.
  - Pricing and payment gating: no, both are enforced on the server.
- **Database and concurrency risks:** Yes (DB-1, DB-2, BE-1 b/c, BE-3).
- **Critical usability issues:** Yes. Registration is currently impossible to complete legitimately, and application IDs are unrecoverable.
- **Reproducible failure paths:** OCR batch overrun, committees that can't be reactivated, deleted committees reappearing, and the silently ignored phone pattern.
- **What remains unknown:**
  - What the screen capture shows.
  - The production hosting setup and how its proxy sets `X-Forwarded-For`.
  - Real MongoDB behaviour under load.
  - Visual layout across viewports, which needs browser testing.
  - The admin password's strength.
