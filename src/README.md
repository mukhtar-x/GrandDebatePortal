# The Grand Debate '26 Frontend

This guide describes the frontend under `src/`: how the routes, shared components, page-specific components, static data and public assets fit together; what is currently mocked; and what still needs to be supplied or connected.

## Stack and local commands

- Next.js App Router, React and TypeScript.
- Tailwind CSS v4 is available, with the event's main styling defined in `app/globals.css`.
- No API calls are made by these frontend screens. Registration and portal data are mock-only.
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
| `/portal` | `app/(portal)/portal/page.tsx` | Looks up a mock application and displays its status. |
| `/archive` | `app/(portal)/archive/page.tsx` | Shows general-resource and committee folders with empty states until documents are supplied. |

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
  Flow --> MockSave[saveMockRegistration]
  Portal --> Lookup[PortalLookup]
  Lookup --> MockFind[findMockApplication]
  MockSave --> Session[sessionStorage for this browser tab]
  MockFind --> Session
  MockFind --> Samples[DEMO_APPLICATIONS]
  Committees --> CommitteeData[data/committee-details.ts]
  Archive --> CommitteeData
  CommitteeData --> Images[public/committee-logos]
```

### Shared shell and visual system

- `app/layout.tsx` loads Cinzel and Montserrat, sets the site metadata and imports `app/globals.css`.
- `app/globals.css` defines the Oxford Blue, Space Cadet, Grand Gold, Dark Beige and Desert Sand tokens; typography; shared controls; page layouts; breakpoints; focus states; and reduced-motion behavior.
- `components/shared/site-header.tsx` contains the desktop and mobile navigation. On mobile it uses a native `<details>` menu, tracks the open state, highlights the current route and closes the menu after a navigation link is selected.
- `components/shared/site-footer.tsx` contains the event organizer and supplied contact/social links.
- `components/ui/form-fields.tsx` provides reusable labelled input, select and textarea components used by the form and lookup UI.

Keep common colors, controls and spacing in the shared stylesheet/components so new pages stay visually consistent.

### Registration flow

`app/(portal)/register/page.tsx` composes the page heading, registration banner, event strip and `components/registration/registration-flow.tsx`.

`RegistrationFlow` owns the form state and switches between:

- `SoloDelegateFields` for one delegate.
- `DelegationFields` for a 4–7 person group, including the head-delegate contact and optional head-as-delegate behavior.
- `CommitteePreferences` for first and second preferences, using the committee list in `data/event.ts`.
- `PaymentSection` for the calculated total, receipt file picker and optional transaction ID.

`components/registration/types.ts` defines the form value shapes. Submission currently uses browser validation, creates a demo application with `saveMockRegistration`, and shows a confirmation with a generated demo ID. The confirmation links to `/portal`.

The selected receipt file is currently used only to display its filename. The file contents and the rest of the form are not uploaded or persisted by the mock. The mock record stores only the application ID, email, first name, registration type and delegate names.

### Application lookup

`app/(portal)/portal/page.tsx` renders `components/portal/portal-lookup.tsx`. The lookup accepts email plus application ID, then calls `findMockApplication` in `data/portal-mocks.ts`.

The mock lookup checks both:

1. Registrations stored in this browser tab's `sessionStorage` by the mock registration flow.
2. A small set of hard-coded demo records covering review, confirmed, allocated, action-required and waitlisted states.

Demo buttons load sample records for preview. The receipt re-upload action and status changes are visual simulations; they do not reach an organiser or persist to a backend.

### Committees and archive

- `data/committee-details.ts` is the single source for committee names, descriptions, logo URLs and image dimensions. It feeds both the committee cards and archive folders.
- The images live in `public/committee-logos/`; the event poster and registration header live in `public/brand/`.
- `app/(portal)/committees/page.tsx` shows the supplied committee descriptions and labels the unconfirmed agendas, levels, seats and study guides as pending.
- `app/(portal)/archive/page.tsx` lists the planned general resources and committee folders. Download controls remain disabled until document files are available.

## What is still missing

| Area | Current state | Needed to finish it |
| --- | --- | --- |
| Frontend-to-backend integration | Not connected, as planned for the backend teammate. | API endpoint contracts, request/response types, error behavior and agreed authentication/session handling. Add a separate API/service layer, then replace the mock calls without putting network code inside presentational field components. |
| Payment instructions | The form warns that account details are being confirmed. | Confirmed account title, bank or payment provider, account number and approved wording. Do not publish unverified payment details. |
| Receipt handling | Browser file picker only; filename is shown. No upload, persistence or configured maximum size. | Backend upload endpoint, accepted file types and size limit, upload progress/error responses, and retention rules. |
| Committee details | Five logos and suitability descriptions are present. Agenda, difficulty level and seat count are marked pending. Study-guide buttons are disabled. | Final agendas, levels, seat counts and each approved guide/link. |
| Archive | General-resource labels and committee folders are present, but there are no downloadable documents. | The PDFs/files, final titles, short descriptions, sizes and last-updated dates. Enable downloads only for available files. |
| Portal status | Demo records and local registrations only. Action-required receipt upload is simulated. | Backend lookup/status contract, authoritative status messages, delegation data, allocation fields and receipt resubmission endpoint. |
| Landing page | Includes the event identity, date/venue and entry links. | The content brief also calls for a countdown, registration-window banner, About section, key-detail cards, sponsor section, committee teaser, how-it-works steps and FAQ accordion. Sponsor content is explicitly pending; the other sections still need to be built if the landing page must match the full brief. |
| Production event data | Event dates, fees, contacts and registration-window cutoffs are static frontend data. | Confirm these values before launch and update `data/event.ts` if any change. Registration-window logic uses the `Asia/Karachi` timezone. |

## Performance and consistency notes

- Most route pages are Server Components. Client-side JavaScript is limited to interactive areas such as the header menu, registration form and lookup.
- Keep committee and event copy in data modules rather than duplicating it across routes.
- Use `next/image` for the logo, committee marks, poster and registration banner so image delivery can be optimized by Next.js. Avoid loading the same image as both a CSS background and an `<Image>`.
- Prefer CSS and native browser controls over adding a dependency for a small interaction. The mobile menu uses native `<details>` behavior and closes after link selection.
- Preserve the existing breakpoints, keyboard focus styles and reduced-motion rules in `globals.css` when adding components.
- Keep large new work out of client components unless it needs browser state or event handling. This helps keep initial page JavaScript small.

## Future API integration boundary

When the backend is ready, keep the visual components responsible for rendering fields and user feedback. Put request/response mapping in a service module (for example, `src/lib/api/registration.ts` and `src/lib/api/portal.ts`) and have `RegistrationFlow` and `PortalLookup` call those functions. Replace `saveMockRegistration` and `findMockApplication` at that boundary. Preserve the page layout and field components unless the API contract requires a visible change.

The current mock modules are safe to remove only after both flows use the agreed backend service and the demo behavior is no longer needed.
