# App store listing — DRAFT (owner review required)

Derived from the code on 2026-10-16. ⚠️ = uncertain, owner/Dev must confirm.

## Basics
- **App name:** ClientReady
- **Subtitle (iOS, ≤30):** Invoices, jobs & crew in one app (30)
- **Short description (Google, ≤80):** Send proposals and invoices, schedule jobs, run your crew and get paid directly.
- **Category:** Business (secondary: Productivity)
- **Support URL:** [Support URL] · **Marketing URL:** [Marketing URL] · **Privacy URL:** [Domain]/privacy · **Terms:** [Domain]/terms · **Account deletion URL (Google):** [Account deletion URL] — page does not exist yet, see account-deletion spec.
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

## Apple privacy "nutrition label"
Tracking: **No** (no ad/analytics/tracking SDKs found in package.json or src).
Data linked to the user, used for **App Functionality** only:
| Type | Collected? | Source in code |
|---|---|---|
| Contact info – Email | Yes | Supabase auth sign-in; business email in profile |
| Contact info – Name, Phone, Physical address | Yes | Business profile; **clients' names/phones/addresses (other people's data)** |
| User content – Photos | Yes | JobPhotos (camera/library, stored as data URLs in synced documents) |
| User content – Other (documents, signatures, job messages) | Yes | documents, signatures, change orders |
| Financial info – Other | Yes | recorded payments, payment handles/bank instructions shown on invoices. No card numbers (entered on Stripe) |
| Identifiers – User ID | Yes | Supabase user id |
| Location | **No** — no geolocation API used. ⚠️ Clients' street addresses are contact info, not location |
| Usage data / Diagnostics | No ⚠️ — confirm hosting (Vercel?) and Supabase logs don't count; no crash SDK found |
| Purchases | No ⚠️ — becomes Yes if paid plans (S1) use in-app purchase |

## Google Play Data Safety
- Data encrypted in transit: Yes (HTTPS/Supabase). ⚠️ confirm.
- Users can request deletion: **Must be Yes for launch — currently only by email**; in-app + web URL needed.
- Shared with third parties: No sharing for ads. Service providers (Supabase hosting, Resend for emails the owner sends, Stripe/payment providers the owner connects) count as "processing on your behalf", not sharing ⚠️ confirm with Play's definitions.
- Collected (required, app functionality, account management): Personal info (name, email, phone, address), Financial info (payment records; "other financial info"), Photos, Files & docs (documents/signatures), App activity: No ⚠️, App info & performance: No ⚠️, Location: No, Device IDs: No.
- Optional vs required: photos optional; email required.

## Uncertain answers to resolve
1. Hosting/server logs (IP addresses) — may need "Diagnostics" or Play "App info & performance".
2. Whether the native wrapper (Dev) adds any SDK (push, crash reporting) — re-audit after wrapper lands.
3. Payment handles/bank instructions: "Financial info" category confirmation.
4. Paid plans billing method (Apple IAP rules may apply to subscriptions sold in-app).
5. Account deletion missing — blocks both stores.
6. Data retention period and support email still placeholders.
