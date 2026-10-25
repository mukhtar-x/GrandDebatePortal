# The Grand Debate '26 Frontend

This guide describes the frontend under `src/`: how the routes, shared components, page-specific components, static data and public assets fit together, and what still needs to be supplied.

## Stack and local commands

- Next.js App Router, React and TypeScript.
- Tailwind CSS v4 is available, with the event's main styling defined in `app/globals.css`.
- Registration, application lookup and receipt resubmission use the app's API routes through `src/lib/api/`.
- No additional packages were added for the frontend.

Run commands from the project root, one level above `src/`:

```bash
npm run dev
npm run lint
npm run build
```

The site uses Cinzel and Montserrat from `next/font/google`. Next downloads and bundles these fonts during the build, so the first build needs access to Google Fonts (or a font cache). If deployment builds must work without network access, provide the licensed font files and switch the imports to `next/font/local`.

## Routes and page composition

| URL | Page file | What it does |
| --- | --- | --- |
| `/` | `app/page.tsx` | Landing page with event identity, date and venue, plus links to registration and application lookup. |
| `/committees` | `app/(portal)/committees/page.tsx` | Lists the five committees, suitability notes, logo, and pending agenda/level/seat information. |
| `/register` | `app/(portal)/register/page.tsx` | Displays the event header, event details and interactive solo/delegation registration form. |
| `/portal` | `app/(portal)/portal/page.tsx` | Looks up an application by email and application ID, shows its status, and supports requested receipt resubmission. |
| `/archive` | `app/(portal)/archive/page.tsx` | Lists general event resources and committee folders with the documents currently supplied under `public/docs/`. |
| `/admin` | `app/admin/page.tsx` | Organiser dashboard for reviewing applications, receipts, payments and committee allocations. |

`(portal)` is a Next.js route group, not part of the URL. Its `layout.tsx` wraps the four inner pages with the shared header, main content region and footer. The root landing page uses the same shared header and footer directly.

## How the frontend pieces connect

```mermaid
flowchart TD
  Layout[app/layout.tsx: fonts and global CSS] --> Home[app/page.tsx]
  Layout --> Group[app/(portal)/layout.tsx]
  Group --> Committees[committees/page.tsx]
  Group --> Register[register/page.tsx]
  Group --> Portal[portal/page.tsx]
  Group --> Archive[archive/page.tsx]
  Home --> Shared[SiteHeader and SiteFooter]
  Group --> Shared
  Register --> Flow[RegistrationFlow]
  Flow --> Fields[Registration field components]
  Flow --> EventData[data/event.ts]
  Flow --> RegistrationAPI[lib/api/registration.ts]
  RegistrationAPI --> RegisterRoute[POST /api/register]
  Portal --> Lookup[PortalLookup]
  Lookup --> PortalAPI[lib/api/portal.ts]
  PortalAPI --> StatusRoute[POST /api/status]
  PortalAPI --> ReceiptRoute[POST /api/status/receipt]
  Committees --> CommitteeData[data/committee-details.ts]
  Archive --> CommitteeData
  CommitteeData --> Images[public/assets/08_Committee_Logos/PNG]
```

### Shared shell and visual system

- `app/layout.tsx` loads Cinzel and Montserrat, sets the site metadata and imports `app/globals.css`.
- `app/globals.css` defines the Oxford Blue, Space Cadet, Grand Gold, Dark Beige and Desert Sand tokens; typography; shared controls; page layouts; breakpoints; focus states; and reduced-motion behavior.
- `components/shared/site-header.tsx` is a Server Component for the static brand shell. `components/shared/site-navigation.tsx` is the small client island for the current-route highlight; its native `<details>` menu owns its open state without mirrored React state.
- `components/shared/site-footer.tsx` contains the event organizer and supplied contact/social links.
- `components/shared/site-intro.tsx` plays the cinematic entrance once on a full page load; `components/shared/hero-logo-reveal.tsx` loads the home-only reveal after the intro completes. Both are muted, have no player controls and respect reduced-motion preferences. The hero uses a lossless fast-start 1080p video on desktop and a high-quality 720p encode on mobile. Its still frame comes from the supplied poster, while the letterbox surround uses a seamless navy grain texture.
- `components/ui/form-fields.tsx` provides reusable labelled input, select and textarea components used by the form and lookup UI.

Keep common colors, controls and spacing in the shared stylesheet/components so new pages stay visually consistent.

### Client boundaries and rendering performance

- Route pages, shared header/footer shell, archive, committee cards, and reusable form-field components remain Server Components. Client boundaries are limited to the header navigation, intro sequence, home-only reveal, registration flow, and application lookup/resubmission.
- `reactCompiler: true` is enabled in `next.config.ts`. It automatically memoizes safe component calculations, callbacks, and rendering. Do not add `useMemo`, `useCallback`, or `memo` for cheap values without measured evidence; keep explicit callback hooks only where an effect depends on a stable identity.
- The global intro and home-only reveal are separate modules, so reveal-specific playback logic is not part of other route components.

### Registration flow

`app/(portal)/register/page.tsx` composes the page heading, registration banner, event strip and `components/registration/registration-flow.tsx`.

`RegistrationFlow` owns the form state and switches between:

- `SoloDelegateFields` for one delegate.
- `DelegationFields` for a 4–7 person group, including the head-delegate contact and optional head-as-delegate behavior.
- `CommitteePreferences` for first and second preferences, using the committee list in `data/event.ts`.
- `PaymentSection` for the calculated total, receipt file picker and optional transaction ID.

`components/registration/types.ts` defines the form value shapes. Submission uses browser validation, sends the form and receipt to `POST /api/register`, and shows the returned application ID on success. The confirmation links to `/portal`.

The selected receipt is sent with the form to the registration API.

### Application lookup

`app/(portal)/portal/page.tsx` renders `components/portal/portal-lookup.tsx`. The lookup submits the email and application ID to `POST /api/status`; receipt resubmission uses `POST /api/status/receipt`.

### Committees and archive

- `data/committee-details.ts` is the single source for committee names, descriptions, logo URLs and image dimensions. It feeds both the committee cards and archive folders.
- Committee images live in `public/assets/08_Committee_Logos/PNG/`; the home poster and registration header live in `public/assets/07_Posters_and_Headers/`. The header logo and favicon are in `public/assets/01_Logo/`.
- `app/(portal)/committees/page.tsx` shows committee descriptions and guide links. Committee agendas, levels and seat counts still require organiser confirmation.
- `app/(portal)/archive/page.tsx` lists general resources and committee documents currently available under `public/docs/`.

## What is still missing

| Area | Current state | Needed to finish it |
| --- | --- | --- |
| Frontend-to-backend integration | Registration, lookup and receipt resubmission are connected to API routes. | Validate the API integration against the production database and deployment configuration. |
| Payment instructions | The form warns that account details are being confirmed. | Confirmed account title, bank or payment provider, account number and approved wording. Do not publish unverified payment details. |
| Receipt handling | Registration uploads the receipt through the API; the server validates and analyzes it before storage. The portal supports resubmission when action is required. | Confirm operational retention rules and monitor storage/processing in the deployed environment. |
| Committee details | Five logos and suitability descriptions are present. Agenda, difficulty level and seat count are marked pending. Study-guide buttons are disabled. | Final agendas, levels, seat counts and each approved guide/link. |
| Archive | General-resource labels and committee folders are present, but there are no downloadable documents. | The PDFs/files, final titles, short descriptions, sizes and last-updated dates. Enable downloads only for available files. |
| Portal status | Lookup and action-required receipt resubmission use API routes and application data. | Verify production configuration and end-to-end status behavior after deployment. |
| Landing page | Includes the event identity, date/venue and entry links. | The content brief also calls for a countdown, registration-window banner, About section, key-detail cards, sponsor section, committee teaser, how-it-works steps and FAQ accordion. Sponsor content is explicitly pending; the other sections still need to be built if the landing page must match the full brief. |
| Production event data | Event dates, fees, contacts and registration-window cutoffs are static frontend data. | Confirm these values before launch and update `data/event.ts` if any change. Registration-window logic uses the `Asia/Karachi` timezone. |

## Performance and consistency notes

- Most route pages are Server Components. Client-side JavaScript is limited to interactive areas such as the header menu, registration form and lookup.
- Keep committee and event copy in data modules rather than duplicating it across routes.
- Use `next/image` for static images and muted, controls-free video elements for the cinematic intro and home hero reveal.
- Prefer CSS and native browser controls over adding a dependency for a small interaction. The mobile menu uses native `<details>` behavior and closes after link selection.
- Preserve the existing breakpoints, keyboard focus styles and reduced-motion rules in `globals.css` when adding components.
- Keep large new work out of client components unless it needs browser state or event handling. This helps keep initial page JavaScript small.

## API integration boundary

Keep visual components responsible for rendering fields and user feedback. Request/response mapping belongs in `src/lib/api/registration.ts` and `src/lib/api/portal.ts`; `RegistrationFlow` and `PortalLookup` call those service functions. Preserve the page layout and field components when changing API contracts unless the user experience needs to change.

## Admin operations

- `/admin` authenticates through the existing `/api/admin/login` flow and a signed, HttpOnly session cookie. Configure `ADMIN_PASSWORD` with at least eight characters in `.env.local`; the dashboard does not store the secret in browser storage.
- The dashboard connects to the admin APIs for application search/filtering and roster details, payment confirmation and action requests, secure receipt viewing, receipt reanalysis and batch checks, CSV export, committee edits, allocation, waitlisting and allocation removal.
- When an organiser marks a payment `Action Required`, the head delegate uploads a corrected screenshot from the applicant status page using `POST /api/status/receipt`. The admin dashboard only requests a correction and reviews the applicant's replacement; organisers do not upload receipts.
- `npm run seed` runs `scripts/seed.ts`, which upserts the five committee records and two development registrations. It requires `MONGODB_URI` in `.env.local`. Seed application IDs and emails are fixed so reruns update those same records; use only against a development database.
- `npm run test:api` runs unit-style pricing/normalization checks and, when a local app is reachable, HTTP integration checks. Set `API_BASE_URL` to choose the server. Registration writes are opt-in with `RUN_WRITE_TESTS=1` and should only target a development database.
