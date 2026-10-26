# The Grand Debate '26 Portal

The Grand Debate '26 is a website and registration portal for The Literary Club (TLC),
FAST-NUCES Karachi. It combines public event information, delegate registration and status
lookup, document access, and an authenticated organiser dashboard.

> **Operational status:** Core website and portal functionality is implemented in the
> repository. This README describes the code, not a production readiness certification.
> No production deployment or production database has been validated as part of this work.

## Event information

| Detail | Information |
| --- | --- |
| Dates | 18–20 November 2026 |
| Daily timings | 8:00 AM–4:00 PM |
| Venue | FAST-NUCES Karachi Main Campus, National Highway |
| Audience | School and university students |
| Registration types | Solo delegate or delegation of 4–7 |
| Committees | UNSC, DISEC, SOCHUM, UN Women, PNA |
| Allocation target | Within 1–3 business days after payment confirmation |
| Refunds | Registrations are final and non-refundable |

The event date, rates, registration windows, contacts, and committee choices are application
data and should be re-confirmed with organisers before launch.

## Features and implementation status

### Implemented in the code

- Public home, committee, registration, applicant portal, archive, and admin pages.
- Solo and delegation registration forms; delegation size is limited to 4–7 people.
- Server-side validation of delegate data, phone numbers, preferences, and pricing.
- Early-bird and regular fee calculation using the `Asia/Karachi` registration-window rules.
- Payment-receipt upload and resubmission. Files are type-checked by content, size-limited,
  and stored in MongoDB GridFS; image receipts are normalized before storage.
- OCR and receipt review signals, including hashes, duplicate/editing indicators, and an
  optional vision-model second opinion. AI results are advisory and do not confirm payments.
- Application lookup by registration email and application ID, with payment and delegate
  status information.
- Admin sign-in, application/roster review, payment confirmation or action-required response,
  receipt viewing/reanalysis, CSV export, and committee/delegate management.
- Committee creation/editing, capacity tracking, delegate allocation, waitlisting, and
  allocation removal.
- Static public event rulebook and committee study-guide PDFs under `public/docs/`.
- Seed script and API tests for development workflows.

### Implemented but requiring operational setup or verification

- MongoDB-backed registration, receipt storage, status lookup, and organiser operations
  require a reachable MongoDB deployment.
- Admin access requires individual accounts in `ADMIN_USERS`.
- Optional receipt AI analysis requires a provider key and model. It is disabled unless both
  are configured.
- Deployment configuration, production database behavior, backups, monitoring, and end-to-end
  operation have not been certified here.

### Not implemented or awaiting organiser confirmation

- Transactional email delivery uses Google SMTP with OAuth2 when the mail environment variables
  are configured. Delivery failures are logged and do not roll back registration or payment
  operations; there is not yet a durable retry queue.
- Payment account title and transfer instructions need organiser approval.
- Final agendas, committee levels/capacities, and any other event-specific committee details
  need confirmation. A seat count of `0` means unlimited in the admin interface.
- Sponsor content and final event copy need confirmation.
- Production deployment, monitoring, backups, privacy/retention policy, and a live operational
  test remain to be completed.
- Review the homepage against the final event brief before launch; any additional campaign
  sections requested by organisers should be tracked and implemented separately.

## Technology

- **Next.js 16 App Router**, React 19, and TypeScript.
- **MongoDB** with **Mongoose** for applications, delegates, payments, committees, rate limits,
  and receipt metadata/files.
- **Tailwind CSS 4** and project-specific CSS for the visual system.
- **Sharp** for receipt-image processing; **Tesseract.js** and English trained data for OCR;
  **unpdf** for PDF text extraction.
- Optional OpenAI-compatible vision endpoint for receipt second-opinion checks.
- ESLint 9, TypeScript, `tsx` scripts, and Node's test/assert utilities.

The application is a Next.js Node application, not a static export. Interactive browser
features are kept in client components; pages, data access, and API handlers run on the
server. `next.config.ts` enables React Compiler, Cache Components and partial prefetching,
adds security headers, and includes Tesseract worker/data files in API function tracing.

## Architecture and data flow

```text
Browser
  ├── Public pages and registration/status client components
  └── /admin dashboard
          │ same-origin requests
          ▼
Next.js App Router pages and Route Handlers (src/app)
  ├── src/lib: validation, pricing, auth, receipt processing, database and mail
  ├── src/models: Mongoose schemas
  └── MongoDB
       ├── application/delegate/payment/committee records
       └── GridFS bucket "receipts" for uploaded payment files
```

### Source layout

| Location | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Public landing page |
| `src/app/(portal)/` | Shared public shell and committees, registration, portal, and archive pages |
| `src/app/admin/` | Organiser dashboard page and styles |
| `src/app/api/` | Registration, status, committee, and admin Route Handlers |
| `src/components/registration/` | Registration form and its field sections |
| `src/components/portal/` | Applicant status lookup and receipt resubmission UI |
| `src/components/admin/` | Admin dashboard and application/committee workflows |
| `src/components/shared/` | Site header, navigation, intro, hero, and footer |
| `src/data/` | Event and committee display data |
| `src/lib/` | Shared domain logic, database connection, auth, API helpers, OCR/receipt processing |
| `src/models/` | Mongoose models for Application, Delegate, Payment, Committee, and RateLimit |
| `scripts/seed.ts` | Development committee and demo-registration seed data |
| `test/api.test.ts` | Validation checks and optional HTTP/database integration checks |
| `public/assets/`, `public/docs/` | Images, videos, branding, rulebook, and committee PDFs |

MongoDB transactions are used for coordinated admin updates. Use a MongoDB deployment that
supports transactions (normally a replica set or compatible managed cluster), including for
local development if exercising those workflows.

## Routes and APIs

### Pages

| URL | Purpose |
| --- | --- |
| `/` | Event home |
| `/committees` | Committee information and available guides |
| `/register` | Solo/delegation registration |
| `/portal` | Applicant status lookup and requested receipt replacement |
| `/archive` | General event and committee documents |
| `/admin` | Authenticated organiser dashboard |

### API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /api/register` | Validate and create a registration and store its payment receipt |
| `POST /api/status` | Look up an application with email and application ID |
| `POST /api/status/receipt` | Submit a replacement receipt when requested |
| `GET /api/committees` | Return active/public committee information |
| `/api/admin/login`, `/logout`, `/me` | Admin session lifecycle |
| `/api/admin/overview` | Admin dashboard data |
| `/api/admin/applications` and `/[applicationId]` | Search applications and inspect/update records |
| `/api/admin/payments/[applicationId]/confirm` and `/reject` | Review payment status |
| `/api/admin/receipts/[fileId]`, `/api/admin/payments/[applicationId]/reanalyze`, `/api/admin/receipts/check-pending` | Secure receipt access and analysis |
| `/api/admin/committees` and `/[code]` | Create, list, edit, and remove/deactivate committees |
| `/api/admin/delegates/[id]/allocate` and `/waitlist` | Allocate, remove, or waitlist a delegate |
| `/api/admin/export` | Export admin data as CSV |
| `GET /api/admin/audit` | View the 100 most recent admin mutation audit records |

Admin mutations require a valid server-side session and same-origin request checks. The admin
session is an HttpOnly cookie backed by a revocable server-side session record. Removing an
organiser from `ADMIN_USERS` or changing their password hash invalidates their existing
sessions. Authorized admin mutations append actor, method, path and time to the audit log,
available at `GET /api/admin/audit`.

## Registration and payment workflow

1. A solo delegate or delegation submits its details, committee preferences, and one receipt.
2. The server validates the payload and computes the applicable fee; it stores the receipt in
   GridFS and records the application, delegates, and payment.
3. Organisers inspect the payment in `/admin`. They can confirm it or request a replacement
   receipt; the applicant can check their status using their email and application ID.
4. After confirmation, organisers allocate committees and country/portfolio assignments.
5. Applicants see application/payment and delegate allocation states in the portal.

The public fee schedule in the current project is PKR 2,000 per delegate for the early-bird
window (through 7 November 2026) and PKR 2,400 for the regular window (8–15 November 2026).
Registration closes from 16 November 2026. Check `src/lib/pricing.ts` and `src/data/event.ts`
before changing or announcing these values.

## Environment variables

Copy `.env.example` to `.env.local` for local development and replace placeholders. Never
commit `.env.local`, real credentials, or production secrets.

### Runtime configuration

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes for database features | MongoDB connection URI. Needed by registration, status, admin, receipt storage, and seeding. |
| `ADMIN_USERS` | Yes for admin sign-in | JSON array of organiser objects with `userId`, `name`, and a `passwordHash` generated by `npm run admin:hash -- '<password>'`. Passwords must be at least 8 characters; use 12 or more when possible. |
| `RECEIPT_AI_KEY` | Optional | API key for an OpenAI-compatible receipt vision endpoint. |
| `RECEIPT_AI_MODEL` | Optional | Vision-capable model name. AI analysis is enabled only when both this and the key are set. |
| `RECEIPT_AI_BASE_URL` | Optional | OpenAI-compatible API base URL; defaults to Google's Gemini OpenAI-compatible endpoint. |

If AI receipt review is enabled, receipt data is sent to the configured third-party API.
Confirm the provider, data handling, and applicable privacy requirements before enabling it.
Without the two required AI settings, receipt AI review is disabled; manual organiser review
remains the decision-maker.

When storing `ADMIN_USERS` in `.env.local`, escape the two `$` characters in each scrypt hash
as `\$`; Next.js expands unescaped `$` references while loading dotenv files. Deployment
secret managers should receive the normal unescaped hash value.

Next.js also manages `NODE_ENV`. The deployment platform may set `PORT`; neither is a
project-specific secret. There are no `NEXT_PUBLIC_*` variables currently required.

### Test-only settings

| Variable | Default | Description |
| --- | --- | --- |
| `API_BASE_URL` | `http://localhost:3000` | Base URL used by `npm run test:api` for HTTP checks. |
| `TEST_STATUS_EMAIL` | Seed solo demo email | Email used by optional database-backed status checks. |
| `TEST_STATUS_APPLICATION_ID` | Seed solo demo ID | Application ID used by optional database-backed status checks. |
| `RUN_WRITE_TESTS` | unset | Set to `1` only to opt in to registration write tests. |
| `ALLOW_REMOTE_WRITE_TESTS` | unset | Must be set to `1` to permit opted-in write tests against a non-local host. Do not use against production. |
| `RUN_ADMIN_CRUD_TESTS` | unset | Set to `1` to opt in to database-mutating admin CRUD checks. Requires dedicated development-only `TEST_ADMIN_USER_ID` and `TEST_ADMIN_PASSWORD`. |
| `TEST_ADMIN_USER_ID` / `TEST_ADMIN_PASSWORD` | unset | Development-only admin credentials for the opt-in admin CRUD check. Never use production accounts. |

The test script may make HTTP requests to the configured API. Do not point it at production.
The seed script upserts fixed demo records; run it only against a development database.

## Local development

Prerequisites: a Node.js version supported by the installed Next.js 16 release, npm, and a
MongoDB database for database-backed workflows.

```bash
npm install
cp .env.example .env.local
# Edit .env.local with a development MONGODB_URI and individual ADMIN_USERS.
npm run dev
```

Open `http://localhost:3000`. Public pages can be explored without database credentials, but
registration, applicant lookup, and admin data operations need MongoDB. Admin login also
requires an `ADMIN_USERS` entry for each organiser.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |
| `npm run admin:hash -- '<password>'` | Generate an scrypt password hash for one `ADMIN_USERS` entry |
| `npm start` | Serve the completed build |
| `npm run seed` | Upsert development committees and demo applications |
| `npm run test:api` | Run validation checks and available HTTP integration checks |
| `npm run email:smoke` | Send two synthetic registration emails through Google SMTP |

### Transactional email

The app sends registration, receipt, payment-review, allocation, and waitlist updates through Google SMTP using Nodemailer OAuth2. The TLC Workspace account does not allow App Passwords, so the server uses a refresh token authorized by `tlc.khi@nu.edu.pk`. Configure these environment variables locally and in the production deployment:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SMTP_USER` | Google mailbox used to authenticate and send, for example `tlc.khi@nu.edu.pk`. |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID from the Google Cloud project. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret. Keep this secret. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Refresh token granted by the sending mailbox. Keep this secret. |
| `GOOGLE_SMTP_HOST` | Optional; defaults to `smtp.gmail.com`. |
| `GOOGLE_SMTP_PORT` | Optional; `465` (SSL, default) or `587` (STARTTLS). |
| `GOOGLE_SMTP_FROM` | Optional approved sender alias; defaults to `GOOGLE_SMTP_USER`. |
| `TGD_SITE_URL` | Public site origin, used to build the application-portal link in emails. |

#### Generating the OAuth credentials

1. In Google Cloud Console, create a project under the `nu.edu.pk` organization and enable the **Gmail API**.
2. In Google Auth Platform, set the audience to **Internal**. Internal apps are limited to accounts in the Workspace organization. For an External app, publish it to Production; External apps left in Testing can have refresh tokens that expire after 7 days for non-basic scopes. [Google OAuth refresh-token rules](https://developers.google.com/identity/protocols/oauth2).
3. Create a **Web application** OAuth client and add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
4. Open [OAuth Playground](https://developers.google.com/oauthplayground), select **Use your own OAuth credentials**, enter the client ID and secret, and use Offline access.
5. Authorize `https://mail.google.com/` as the sending mailbox, exchange the authorization code for tokens, and save the refresh token in `GOOGLE_OAUTH_REFRESH_TOKEN`.

SMTP XOAUTH2 requires the `https://mail.google.com/` scope. This is a restricted, broad Gmail scope that permits reading, composing, sending, and permanently deleting mail; authorize it only if the mailbox owner and Workspace policy approve that access. If that permission is too broad, use the Gmail API with its narrower `gmail.send` scope instead of SMTP. [Google SMTP OAuth scope](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol), [Gmail API scope descriptions](https://developers.google.com/workspace/gmail/api/auth/scopes).

Keep the client secret and refresh token in `.env.local` and the production secret store only; never commit or paste them into chat. To rotate the client secret, add a new secret in Google Cloud Console, update `GOOGLE_OAUTH_CLIENT_SECRET`, confirm sending works, then disable the old secret. Google can invalidate refresh tokens if the user revokes access, the token is unused for 6 months, or the mailbox password changes when Gmail scopes are granted. OAuth clients inactive for 6 months are also automatically deleted. An `invalid_grant` error requires fresh user consent and a new refresh token. An `EAUTH` SMTP error usually points to incorrect credentials or whitespace in an environment value. [Refresh-token expiration](https://developers.google.com/identity/protocols/oauth2), [OAuth client inactivity](https://support.google.com/cloud/answer/15549257).

Google requires secure TLS for SMTP. Gmail also recommends SPF, DKIM, and DMARC for sender-domain authentication and inbox placement; FAST IT manages those records for the university domain. See [Gmail sender guidelines](https://support.google.com/mail/answer/81126). Workspace SMTP relay (`smtp-relay.gmail.com`) is another option, but it requires FAST IT to configure relay policy and is not the current transport.

Email delivery is scheduled after successful API operations and has finite SMTP timeouts. If SMTP credentials are absent or Google rejects a message, the registration/payment operation still succeeds and the server logs the send failure. The app does not yet keep a durable email retry queue.

Run `npm run email:smoke` locally to send two synthetic confirmation emails through the real mailer: a four-delegate delegation example to `ismailsilat7@gmail.com` and a solo example to `k240546@nu.edu.pk`. It uses clearly marked `TGD-TEST-*` application IDs, does not create MongoDB records, and is disabled when `NODE_ENV=production`. Check each inbox and spam/junk folder, plus the terminal output for delivery status.

`npm run test:api` skips HTTP/database-backed checks when no local API/database is available.
Some checks read or write the fixed demo records when enabled and a database is reachable.
Keep `RUN_WRITE_TESTS` unset for routine checks and never use production data for testing.

## Deployment

No hosting provider, deployment manifest, or production environment is configured in this
repository. Deploy as a Node.js Next.js application on a platform that supports the project's
Next.js version, server-side Route Handlers, required function size/runtime, and MongoDB
connectivity; do not deploy as a static site.

Before deployment:

1. Provision MongoDB with transaction support and configure network access, least-privilege
   credentials, backups, and an appropriate database name.
2. Set `MONGODB_URI` and `ADMIN_USERS` in the host's secret manager. Give every organiser
   an individual account and revoke access by removing that account and revoking its sessions.
   Add the AI
   variables only if that feature has been approved.
3. Confirm that the runtime can execute receipt processing (including the traced Tesseract.js
   worker, WASM, and language data). Receipt upload processing should be checked against the
   target host's request/body and execution-time limits.
4. Ensure public assets and all PDFs in `public/docs/` are included. The `studyGuideUrl`
   stored for a public file uses its web path, for example
   `/docs/committees/unsc-study-guide.pdf`—not the local `public/` filesystem prefix.
5. Run `npm run lint` and `npm run build` in the deployment environment. `next/font/google`
   downloads the configured fonts during the build, so build access to Google Fonts (or a
   previously available font cache) may be needed.
6. Verify admin login, a development registration, status lookup, receipt upload/retrieval,
   payment review, allocation, and CSV export against a non-production deployment.
7. Configure monitoring, database backups, and data-retention/access policies. Set the Google
   OAuth SMTP secrets and verify a test delivery before relying on email notifications.

Use `npm start` to run the built app on a Node host. Configure custom domains, TLS, health
monitoring, and platform-specific runtime limits in the hosting provider. Do not run the seed
script against a production database.

## Event contacts

- WhatsApp: **0314 3552058**
- Email: **tlc.khi@nu.edu.pk**
- Instagram: [@tgd_nuces](https://www.instagram.com/tgd_nuces) and
  [@tlc_nu](https://www.instagram.com/tlc_nu/)

## Related documentation

- [`src/README.md`](./src/README.md) — frontend/source-level notes.
- [`AGENTS.md`](./AGENTS.md) — repository-specific development instructions.
