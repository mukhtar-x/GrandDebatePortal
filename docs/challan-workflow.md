# Challan workflow

How QuickPay challans are reserved, paid, recorded and reused during registration, and
what organisers can see in the admin dashboard.

## Contents

- [Summary](#summary)
- [Applicant flow](#applicant-flow)
- [Edge cases](#edge-cases)
- [Challan lifecycle](#challan-lifecycle)
- [Issue order and reuse](#issue-order-and-reuse)
- [What is recorded](#what-is-recorded)
- [Admin dashboard](#admin-dashboard)
- [Test and live modes](#test-and-live-modes)
- [Importing FAST challans](#importing-fast-challans)
- [Abuse protection](#abuse-protection)
- [API reference](#api-reference)
- [Where the code lives](#where-the-code-lives)

## Summary

- A challan is reserved only after the registration details pass the same checks as final
  submission, so applicants are not asked to pay for a registration that would be refused.
- The applicant has **30 minutes** to pay and submit with a challan. After that, the challan
  can no longer be submitted and the applicant generates a new one.
- The old challan then stays out of the pool for a further **15-minute grace period**, in case a
  late payment is still on its way. It goes back into the pool only after that, 45 minutes
  after it was reserved, even if the applicant abandoned it early.
- Unused challans are always issued first. Reused challans are issued least reused first, then
  the one whose grace period ended longest ago.
- Every time a challan is issued, a history record is saved and never deleted. Each
  registration records the challan it was submitted with and any others the applicant
  generated before it.

## Applicant flow

| Step | Applicant sees | System does |
| --- | --- | --- |
| 1. Type | Chooses solo or delegation (4–7) | Nothing is reserved yet |
| 2. Details | Enters delegate details and an optional BA Code | Browser checks required fields |
| 3. Review | Checks every field, then presses **Generate challan** | Runs the full validation, including "email already registered", then reserves a challan for the exact amount |
| 4. Payment | Sees the challan number (with a copy button), the exact amount and a countdown; pays, uploads the receipt and submits | Confirms the challan is still held for these exact details and within its 30 minutes, then records the application |

The countdown in step 4 shows the time left of the 30 minutes. When it reaches zero,
submitting is disabled and the applicant is offered **Generate new challan**, together with
the organisers' email in case they already paid the expired challan.

| Time since the challan was reserved | Applicant can submit | Challan can be given to someone else |
| --- | --- | --- |
| 0–30 minutes | Yes | No |
| 30–45 minutes (grace period) | No; they must generate a new challan | No |
| After 45 minutes | No | Yes |

Fees are fixed when the challan is reserved: PKR 2,000 per delegate (early bird, until
12 November) or PKR 2,400 (regular, 13–18 November), plus a single PKR 500 delegation fee
for delegations. The exact amount is set by the challan inventory; applicants must pay
exactly that amount.

## Edge cases

| Situation | Result |
| --- | --- |
| Applicant refreshes the page | The form and the same challan are restored (saved in this browser tab only) |
| Same email and same details generate again | The same challan is returned; no new challan is used |
| Applicant goes back and continues without changes | The same challan is kept |
| Applicant goes back and **changes any detail** | They are told not to pay the old challan; a new challan replaces it |
| Same email, different details, without the old challan (another tab or device) | Refused with "challan X is already reserved for this email", including when it frees up |
| Any delegate email is already registered | Refused before a challan is issued |
| 30 minutes pass without submitting | The challan can no longer be submitted. The applicant can generate a new one straight away; the old one stays out of the pool for 15 more minutes. |
| Applicant paid the old challan after it expired | They contact the organisers; the admin dashboard shows that challan's history, so the payment can be matched to them |
| Submission is rejected because the challan expired or changed | The error offers **Generate new challan** |
| No matching challan is left in the inventory | "No challans are currently available… contact the organisers" |
| Registration window has closed | No new challans are issued. A challan reserved before closing can still be submitted within its 30 minutes. |

## Challan lifecycle

Each challan record has one of four statuses:

| Status | Meaning |
| --- | --- |
| `Available` | Imported and never issued |
| `Reserved` | Held by an applicant, who can submit with it for 30 minutes |
| `Expired` | Its 30 minutes have passed, or it was released early (details changed or the applicant started over). It can no longer be submitted, and stays out of the pool until its grace period ends. |
| `Submitted` | Used by a registration; never issued again |

```
Available ──generate──► Reserved ──submitted within 30 min──► Submitted (final)
                           │
                           ├── replaced or released early ──┐
                           │                                 ├─► no longer submittable;
                           └── 30 minutes pass ──────────────┘   reusable 45 minutes after reserving
```

Each reservation stores two times:

- `expiresAt`: 30 minutes after reserving; the last moment the challan can be submitted
- `graceUntil`: 15 minutes after `expiresAt`; the earliest moment it can be given to someone else

A challan past `expiresAt` may still show `Reserved` until the same applicant generates
again or someone else reuses it; either way it can no longer be submitted. Reuse is decided
by `graceUntil` at the moment a challan is issued.

## Issue order and reuse

When an applicant generates a challan, the server takes, in one atomic step, the first
challan that matches the registration's category, rate and amount, in this order:

1. Never issued (`issueCount` 0)
2. Fewest previous issues
3. Grace period ended longest ago
4. Lowest challan number

A challan still inside its grace period is never issued, even when nothing else is left.
Unused stock is always used up before reuse starts, and a reused challan is the one least
likely to have a late payment still arriving.

## What is recorded

### Challan history (`ChallanIssue`)

One record is written every time a challan is issued and is never deleted. It holds:

- the challan number, category, rate and amount
- which issue it was (1st, 2nd, …)
- who held it: contact name, email, WhatsApp, institution, type, delegate emails, BA Code
- when it was reserved, its submit-by time (`expiresAt`) and when it could return to the pool
  (`graceUntil`)
- how it ended: `Active`, `Submitted`, `Superseded` (replaced by a new challan), `Released`
  or `Expired` (an `Active` record past its 30 minutes)
- `applicationId` if it was submitted, or `linkedApplicationId` if the same applicant later
  submitted a different challan
- a hashed IP address, used only for abuse limits

### Payment record

| Field | Meaning |
| --- | --- |
| `challanNumber` | The challan the registration was submitted with |
| `otherChallanNumbers` | Other challans the applicant generated first, oldest first |
| `challanEnvironment` | `test` or `live` |

"Other challans" means challans generated in the same form fill, or by the same contact
email in the previous 3 hours. When a registration is submitted, those earlier challans are
linked to it and any still held are released.

The challan number is also shown on the confirmation screen, in the "registration
received" email and in the applicant portal.

## Admin dashboard

| Where | What it shows |
| --- | --- |
| Applications list | The submitted challan, "Also generated: …" for earlier ones, and a red **Reused challan · issued N×** badge when the number was given to more than one applicant |
| Search | Finds applications by submitted or earlier challan number |
| Review payment & roster | A history table for every challan the applicant generated: each holder, reserved time, submit-by time, back-in-pool time and the outcome |
| **Challans** tab | Look up any challan number, submitted or not, to see its full history. Inventory counts per category: Unused, Reusable, Held now and Submitted. |
| Receipt checks | `EARLIER_CHALLAN` (high): the receipt shows a challan this applicant generated earlier, not the submitted one. `CHALLAN_NOT_FOUND` (low): the submitted challan number could not be read. |
| CSV export | `challanNumber` and `otherChallanNumbers` columns |

**Before verifying a payment** with a reused-challan badge or an `EARLIER_CHALLAN` flag, open
the challan history and confirm which applicant the payment belongs to.

## Test and live modes

| | Test | Live |
| --- | --- | --- |
| Set by | `CHALLAN_MODE=test` (test environment is otherwise the non-production default) | `CHALLAN_MODE=live` (default in production) |
| Inventory | 3,000 `TEST-` challans created when `CHALLAN_MODE=test` is explicitly set | Empty until FAST's challans are imported |
| Applicant warning | "Test challan: do not make a real payment" on screen and in the email | None |

Test and live challans are kept apart; a test challan can never be submitted in live mode.

## Importing FAST challans

A signed-in organiser imports live challans in batches of up to 5,000:

```http
POST /api/admin/challans/import
Content-Type: application/json

{
  "challans": [
    { "challanNumber": "1234567", "category": "solo", "rateType": "Early bird", "amount": 2000 },
    { "challanNumber": "1234568", "category": "delegation-4", "rateType": "Regular", "amount": 10100 }
  ]
}
```

- `category`: `solo`, `delegation-4`, `delegation-5`, `delegation-6` or `delegation-7`
- `rateType`: `Early bird` or `Regular`
- `amount`: must equal the fee for that category and rate, including the delegation fee
- Numbers starting with `TEST-`, duplicates within the batch, and numbers that already exist
  are refused; when any row is refused, nothing in the batch is imported.

Amounts per challan:

| Category | Early bird | Regular |
| --- | --- | --- |
| `solo` | PKR 2,000 | PKR 2,400 |
| `delegation-4` | PKR 8,500 | PKR 10,100 |
| `delegation-5` | PKR 10,500 | PKR 12,500 |
| `delegation-6` | PKR 12,500 | PKR 14,900 |
| `delegation-7` | PKR 14,500 | PKR 17,300 |

`GET /api/admin/challans/import` returns the inventory counts shown in the Challans tab.

## Abuse protection

| Protection | Limit |
| --- | --- |
| Challan requests per IP | 10 per minute, 20 per hour |
| Amount changes per contact email | 2 per 30 minutes. Only counted when the new challan is for a different amount from the email's previous one (delegate count, solo/delegation or rate). Refreshing or fixing details is not counted. |
| Challans held at once per browser | 5 |
| Registration submissions per IP | 10 per minute, 20 per hour |
| Challan release requests per IP | 30 per hour |
| Request size | Challan requests 32 KB; registrations must declare a size, and the receipt is capped at 4 MB |
| Bots | A hidden field rejects bots that fill every input |

Request limits are checked in memory on each server instance first, then in MongoDB so they
hold across instances. The held-challan cap uses a first-party, HttpOnly browser cookie and a
database lock to enforce the limit across concurrent requests. Clearing browser cookies can
reset that device identifier; IP request limits remain in place as a separate abuse control.
If MongoDB cannot check a shared rate limit, the endpoint returns `503` and asks the applicant
to retry instead of allowing the request through.

These limits slow down abuse but cannot stop a large network flood. For that, use the
Vercel Firewall, and turn on Attack Challenge Mode during an attack. If bots start
draining the challan pool, the next step is a bot check (such as Cloudflare Turnstile) on
**Generate challan**.

## API reference

| Endpoint | Purpose |
| --- | --- |
| `POST /api/challans/reserve` | Validate details and reserve, resume or replace a challan. Body: `registration`, `draftId`, optional `previousReservationToken`. |
| `DELETE /api/challans/reserve` | Release a reservation early. Body: `reservationToken`. |
| `POST /api/register` | Submit the registration with `reservationToken` and the receipt |
| `GET /api/admin/challans/[challanNumber]` | Full history of one challan (admin) |
| `POST`/`GET /api/admin/challans/import` | Import live challans or view inventory (admin) |
| `GET /api/admin/applications/[applicationId]` | Application detail, including `challans` history (admin) |

Error codes returned to the browser:

| Code | Meaning |
| --- | --- |
| `ALREADY_REGISTERED` | A delegate email already has a registration |
| `CHALLAN_HELD` | This email already holds a challan for different details |
| `NO_CHALLANS` | No matching challan is available |
| `CHALLAN_INVALID` | At submit, the challan has expired or no longer matches the details |
| `RATE_LIMITED` | A request limit or the per-browser reservation cap was reached |
| `RATE_LIMIT_UNAVAILABLE` | Shared rate-limit storage is unavailable; retry shortly |
| `REGISTRATION_CLOSED` | The registration window has ended |

## Where the code lives

| File | Responsibility |
| --- | --- |
| `src/lib/challans.ts` | Reservation timings, issue order, issuing, releasing, recording submitted challans |
| `src/lib/registrationInput.ts` | Shared validation for reservation and registration |
| `src/lib/challanHistory.ts` | Builds the history shown to admins |
| `src/models/Challan.ts` | Challan inventory and current reservation |
| `src/models/ChallanIssue.ts` | Permanent history of every issue |
| `src/app/api/challans/reserve/route.ts` | Reserve, resume, replace and release; challan rate limits |
| `src/app/api/register/route.ts` | Submission; records the submitted and earlier challans |
| `src/app/api/admin/challans/` | Import, inventory and history lookup |
| `src/lib/testChallanPool.ts` | Test-mode inventory |
| `src/components/registration/` | Review and payment steps in the browser |
