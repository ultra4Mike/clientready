# App store listing — DRAFT (owner review required)

Derived from the code on 2026-10-16. ⚠️ = uncertain, owner/Dev must confirm.

## Basics
- **App name:** ClientReady
- **Subtitle (iOS, ≤30):** Invoices, jobs & crew in one app (30)
- **Short description (Google, ≤80):** Send proposals and invoices, schedule jobs, run your crew and get paid directly.
- **Category:** Business (secondary: Productivity)
- **Support URL:** https://clientreadyapp.com/help · **Marketing URL:** https://clientreadyapp.com · **Privacy URL:** https://clientreadyapp.com/privacy · **Terms:** https://clientreadyapp.com/terms · **Account deletion URL (Google):** https://clientreadyapp.com/account/delete (in-app: Settings → Delete account; crew: Crew page → Delete account).
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
- Users can request deletion: **Yes**: in-app (Settings → Delete account) and on the web at https://clientreadyapp.com/account/delete. Requires SUPABASE_SERVICE_ROLE_KEY on the host; otherwise the page falls back to emailing support.
- Data shared with third parties: **No.** Supabase (hosting/database), Resend (emails the owner sends) and payment providers the owner connects are service providers processing data on the business's behalf, not sharing.
- Collected (app functionality / account management): Personal info (name, email, phone, address), Financial info: other (payment records, payment handles / bank instructions), Photos (optional), Files & docs (documents, signatures), App info & performance (server logs/IP; not linked to identity, not used for tracking or ads). Device or other IDs (push subscription endpoint + user agent; optional, only when notifications are turned on; app functionality). Not collected: Location, App activity, Purchase history.
- Required: email. Optional: photos.

## Billing (iOS)
Paid plans are sold on the web only. The iOS app shows no prices, purchase buttons or links to buy (reader-style); Purchases are not collected in-app. Revisit if in-app purchase is ever added.

## Still open
- Support email: support@clientreadyapp.com (live 2026-10-16 via Cloudflare Email Routing). Placeholders: [Data retention period] (suggest 30 days after account closure). URLs filled 2026-10-16: production domain https://clientreadyapp.com is live (www also works; old Vercel URL still works).
- Account deletion shipped (9f81fdd); verify it works on the live host once the service-role key is set.
- ~~Recheck after native wrapper SDKs land~~ **Done 2026-10-16** (Dev 36f18fc, see docs/native-apps.md): @capacitor/core, ios, android 8.5.3, @capacitor/app 8.1.2, androidx libraries, capacitor-swift-pm. No analytics, ads, push or crash SDKs, so no new data types; Tracking = No. Recheck again whenever a native plugin/SDK is added (e.g. native push).
- **@capacitor/camera 8.2.5 added 2026-10-16** (Dev 5fbf887): native camera and photo-library picker for job photos, crew done photos and receipts. iOS `NSCameraUsageDescription` and photo-library usage strings added. Photos are saved to the owner's own ClientReady account data exactly as before (compressed JPEG in database rows; no third-party storage), so **no new data types** (Photos already declared, optional); Tracking still No. Offline photo queue (fa211eb): crew done photos and expense receipts taken offline stay on the device (per user) until sent on reconnect, and are wiped on account deletion; nothing leaves the device except to the owner's storage.
- **App ID:** `app.clientready.mobile` is a placeholder (bundle ID / package name). It is permanent once published on either store, so the owner must confirm it before the first upload.

## Review risk: Apple Guideline 4.2 (minimum functionality)
The iOS app is a WebView loading the live site, which Apple often rejects under 4.2 as "a repackaged website". To reduce risk, ship native touches before submitting and mention them in the review notes:
- Camera / photo picker for job photos: **Done** (@capacitor/camera 8.2.5, 5fbf887) plus offline photo queue (fa211eb). Mention both in review notes as native functionality.
- Push notifications (native APNs via a Capacitor push plugin, not just web push)
- Offline use (bundled offline page; saves on device and syncs later)
- Deep links (clientready:// and Universal Links / Associated Domains, already in 36f18fc)
- Native back/navigation handling and safe-area layout
Also give the reviewer a demo login with sample data. Each added plugin means updating the privacy answers above.

## Subscription flow decision (owner-confirmed 2026-10-16)
- Website (clientreadyapp.com): pricing shown on home page and /plans; plan buttons go to trial sign-up now, and to Stripe subscription checkout once the owner's Stripe account is set up.
- iOS/Android apps: login only. No prices, no subscribe/buy buttons, no links to purchase for the first submission. Users subscribe on the website, then log in to the app.
- Revisit after approval: a "Manage plan" link that opens the website (US external-link rules changed in 2025; outside the US stay strict).
