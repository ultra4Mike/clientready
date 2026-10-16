# App store listing — DRAFT (owner review required)

Derived from the code on 2026-10-16. ⚠️ = uncertain, owner/Dev must confirm.

## Basics
- **App name:** ClientReady
- **Subtitle (iOS, ≤30):** Invoices, jobs & crew in one app (30)
- **Short description (Google, ≤80):** Send proposals and invoices, schedule jobs, run your crew and get paid directly.
- **Category:** Business (secondary: Productivity)
- **Support URL:** [Support URL] · **Marketing URL:** [Marketing URL] · **Privacy URL:** [Domain]/privacy · **Terms:** [Domain]/terms · **Account deletion URL (Google):** [Domain]/account/delete (in-app: Settings → Delete account; crew: Crew page → Delete account).
- **iOS keywords (≤100 chars):** `invoice,estimate,proposal,contractor,crew,scheduling,jobs,quote,billing,timesheet,field service` (93)

## Full description
ClientReady is the all-in-one app for service businesses and contractors. Write a proposal, get it approved with a signature, turn it into an invoice and get paid — from your phone, even offline.

- Proposals and invoices with line items, tax, discounts, deposits and change orders
- Approval links and a client portal: clients view, sign and pay without an account
- Get paid your way: Zelle, Venmo, Cash App, PayPal.me, check or bank transfer — money goes straight to you
- Calendar and job scheduling, recurring jobs and invoices
- Crew accounts: assignments, clock in/out, "On my way", job photos and expenses
- Collect, Reports and a Year packet to see what you're owed and what you earned
- Works offline and syncs when you're back online; download a backup anytime
Start with a 14-day free trial.

## Apple privacy "nutrition label" (owner-approved 2026-10-16)
Tracking: **No** (no ad/analytics/tracking SDKs in package.json or src).
Data linked to the user, used for **App Functionality** only:
| Type | Collected? | Source in code |
|---|---|---|
| Contact info: Email | Yes | Supabase auth sign-in; business email in profile |
| Contact info: Name, Phone, Physical address | Yes | Business profile; clients' names/phones/addresses entered by the business |
| User content: Photos | Yes | JobPhotos (camera/library, stored in synced documents) |
| User content: Other (documents, signatures, job messages) | Yes | documents, signatures, change orders |
| Financial info: Other | Yes | Recorded payments and payment handles / bank instructions shown on invoices. No card numbers (entered with the payment provider) |
| Identifiers: User ID | Yes | Supabase user id |
| Identifiers: Device ID | Yes, linked, App Functionality, only if the user turns on notifications | push_subscriptions (push endpoint, keys, user agent). ⚠️ Apple may treat a push token as not needing disclosure; listing it is the conservative choice |
| Diagnostics | Yes, **not linked** to identity, not tracking | Server/host logs (IP addresses, request logs) |
| Location | No | No geolocation API; client street addresses are contact info |
| Purchases | No | Billing is web-only; nothing is sold in the app |

## Google Play Data Safety (owner-approved 2026-10-16)
- Data encrypted in transit: **Yes**. Requires deploying on an HTTPS host (e.g. Vercel, Netlify, Cloudflare); Supabase is HTTPS.
- Users can request deletion: **Yes**: in-app (Settings → Delete account) and on the web at [Domain]/account/delete. Requires SUPABASE_SERVICE_ROLE_KEY on the host; otherwise the page falls back to emailing support.
- Data shared with third parties: **No.** Supabase (hosting/database), Resend (emails the owner sends) and payment providers the owner connects are service providers processing data on the business's behalf, not sharing.
- Collected (app functionality / account management): Personal info (name, email, phone, address), Financial info: other (payment records, payment handles / bank instructions), Photos (optional), Files & docs (documents, signatures), App info & performance (server logs/IP; not linked to identity, not used for tracking or ads). Device or other IDs (push subscription endpoint + user agent; optional, only when notifications are turned on; app functionality). Not collected: Location, App activity, Purchase history.
- Required: email. Optional: photos.

## Billing (iOS)
Paid plans are sold on the web only. The iOS app shows no prices, purchase buttons or links to buy (reader-style); Purchases are not collected in-app. Revisit if in-app purchase is ever added.

## Still open
- Placeholders: [Support email], [Support URL], [Privacy URL] ([Domain]/privacy), [Marketing URL], [Data retention period] (suggest 30 days after account closure), [Domain] for /account/delete.
- Account deletion shipped (9f81fdd); verify it works on the live host once the service-role key is set.
- **Recheck all answers after the native wrapper's SDKs land** (push, crash reporting, analytics would change them).
