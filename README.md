This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database migrations (Supabase)

SQL migrations live in `supabase/migrations/`. They are **not applied automatically**: run each new
file once in the Supabase dashboard (SQL Editor → paste the file → Run), or with the Supabase CLI
(`supabase db push`) if the project is linked.

### Migrations (run manually, in this order)

| File | What it adds |
|---|---|
| `20261015000000_approval_links.sql` | Approval links (required) |
| `20261015010000_job_scheduling.sql` | Crew job status |
| `20261015020000_crew_isolation_clock.sql` | Crew isolation, clock in/out, expenses |
| `20261015030000_stripe_payments.sql` | Stripe Checkout recording |
| `20261015040000_recurring_unique_period.sql` | One recurring invoice per period |
| `20261015050000_client_portal.sql` | Client portal |
| `20261015060000_crew_done_photos.sql` | Crew done + photos |
| `20261015070000_portal_client_id.sql` | Portal client id |
| `20261015080000_email_log_private.sql` | Private email log |
| `20261015090000_photos_hidden_public.sql` | Photo visibility |
| `20261015100000_document_tombstones.sql` | Synced deletes |
| `20261015110000_on_my_way.sql` | On my way |
| `20261015120000_late_fee_settings.sql` | Late fee settings |
| `20261015130000_stripe_reliability.sql` | Pending payments, checkout sessions, timezone, idempotent recording |
| `20261015140000_checkout_guard_pending_owner.sql` | One open checkout per invoice; owner on Stripe tables (after 130000) |
| `20261015150000_review_link.sql` | Review link |
| `20261015160000_crew_unavailable.sql` | Crew days off |

All are re-runnable. `supabase/templates/` holds **review-before-run** templates that are not migrations.
Open manual steps are tracked in `docs/OPEN_ITEMS.md`.

### `20261015000000_approval_links.sql` — client approval links (required)

Approval links (`/approve?t=<token>`) let a customer view and approve one proposal or invoice
without logging in. The app only has the public anon key, and row-level security keeps anon users
out of the `documents` table, so the migration adds:

- `get_document_by_approval_token(token)` — `SECURITY DEFINER`, returns a trimmed, read-only copy of
  the single document whose `data.approval.token` matches (no token, owner job costs, crew,
  schedule or internal ids) plus the business name/logo/contact/pay link.
- `approve_document(token, name)` — `SECURITY DEFINER`, changes only `data.approval`
  (status → approved, time, optional name up to 100 chars) and only while it is pending.
- A trigger that stops an owner's stale save from turning an approved link back to pending.
- An index on the token. `EXECUTE` is granted to `anon` and `authenticated` for the two functions.

Until it is run, "Share approval link" still creates links but customers will see
"Could not load this document". The browser app only uses the public anon key. The server (Stripe routes under `src/app/api/pay` and `src/app/api/stripe`) uses `SUPABASE_SERVICE_ROLE_KEY` for service-role-only functions; it is never sent to the browser.

### `20261015010000_job_scheduling.sql` — job scheduling for crew (required for crew status updates)

- Adds `client_email` and `schedule_status` columns to `crew_jobs` (schedule rows are written by the
  owner's app with ids `<document id>-sched-<employee id>`; they carry date, times, client contact and
  status, never prices or pay).
- `crew_set_job_status(doc_id, status)` — `SECURITY DEFINER`, callable by signed-in users only. It
  checks that the caller's email is assigned to that job and then changes only
  `data.schedule.status`/`updatedAt` on the document and `schedule_status` on the crew rows.
- Re-creates `get_document_by_approval_token` so the customer approval page never receives the
  schedule (run it after the approval-links migration).

### `20261015020000_crew_isolation_clock.sql` — crew isolation, clock in/out, crew expenses (required for /crew)

Run after the job-scheduling migration. It:

- **Repairs row-level security** on `crew_jobs`, `crew_expenses`, `job_drafts`, `employees` and the new
  `crew_clock`: it drops every existing policy on those tables and creates these:
  owners (`owner_id`/`user_id = auth.uid()`) manage their own rows; a crew member (matched by the
  email on their login) can only **read** rows addressed to their own email (and their own employee
  record), and add their own job reports.
- Adds `crew_clock` (clock entries: one per stretch of work, several per worker per job, at most one
  running clock per worker).
- Crew writes go only through `SECURITY DEFINER` functions that check the caller is assigned to the
  job: `crew_clock_in`, `crew_clock_out`, `crew_edit_clock` (own entry, reason required — for a
  forgotten clock-out), `crew_add_expense` (amount/category validated; receipt is a compressed JPEG
  data URL stored in `crew_expenses.receipt`, max ~3 MB). Anonymous users cannot call any of them.

If you had custom policies on those tables, re-add them after running this (it replaces them).

Safe to re-run, including after a failed run. If `employees`, `crew_jobs`, `job_drafts` (crew job
reports) or `crew_expenses` are missing, it creates them with the columns the app uses, and it adds
any missing columns to existing tables. Existing data is not touched. It also creates the
`is_crew_email()` and `list_crew_clients()` functions only if your project does not already have
them; the fallback `list_crew_clients()` returns no clients.

### Card payments with Stripe Checkout (optional)

Customers can pay what is still owed on an invoice by card from the approval link page
(`/approve?t=…`). The amount is always calculated on the server from the saved invoice. When
Stripe confirms the payment, it is added to the invoice's payments ("Card (Stripe)"), once per
checkout. The invoice status is not changed automatically.

1. Run `supabase/migrations/20261015030000_stripe_payments.sql` in the Supabase SQL editor (after the
   approval-links migration). Only the server's service role can call its two functions.
2. Set these environment variables on the server (e.g. Vercel → Settings → Environment Variables), then redeploy:
   - `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys → Secret key (`sk_live_…` or `sk_test_…`).
   - `STRIPE_WEBHOOK_SECRET`: from step 3 (`whsec_…`).
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API → `service_role` key. Server only; never expose it in the browser.
   - Optional: `STRIPE_CURRENCY` (default `usd`).
3. Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://YOUR-DOMAIN/api/stripe/webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

If the keys are missing, the "Pay by card" button is hidden and the API routes answer 503.
Profile → Payments shows a "Card payments (Stripe)" panel: which settings the server has (yes/no and test/live
mode only, never a key), these steps, and the webhook URL to copy (`GET /api/stripe/readiness`).
Card payments only work on invoices shared with an approval link.

## Client portal

One no-login link per client (Invoice page → "Client portal for …" → Share portal link). The customer sees every
sent invoice/proposal for that client (drafts never), the balance and payments, can approve and sign, and pay by
card when Stripe is set up. Owner costs, crew, schedule notes, review state and approval tokens are never returned.
"New link" replaces the old link; "Turn off link" revokes it. Needs `supabase/migrations/20261015050000_client_portal.sql`.

## Email invoices, proposals and reminders (review before sending)

Invoice page → "Email invoice…" / "Email proposal…" opens an editable To / Subject / Message with a preview
(approval link, else the client portal link, plus your payment link). Nothing is sent until you click
**Send email** (or **Open in email app**). Each email is logged on the document (`data.emailLog`: sentAt, to,
subject, how); the status only changes if you tick "Also mark as sent". Customers never see the log
(`supabase/migrations/20261015080000_email_log_private.sql`).

Sending from the app is optional (server env, then redeploy):
- `RESEND_API_KEY`: Resend → API Keys.
- `EMAIL_FROM`: a sender on a domain verified in Resend, e.g. `Your Business <billing@yourdomain.com>`. Replies go to your login email.
- Uses `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `SUPABASE_URL`) to check the owner's session and that the document is theirs.

Without these, the app opens your own email app (mailto) instead. `RESEND_API_BASE` is for tests only.
