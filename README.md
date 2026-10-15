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
"Could not load this document". No service-role key is used anywhere in the app.

### `20261015010000_job_scheduling.sql` — job scheduling for crew (required for crew status updates)

- Adds `client_email` and `schedule_status` columns to `crew_jobs` (schedule rows are written by the
  owner's app with ids `<document id>-sched-<employee id>`; they carry date, times, client contact and
  status, never prices or pay).
- `crew_set_job_status(doc_id, status)` — `SECURITY DEFINER`, callable by signed-in users only. It
  checks that the caller's email is assigned to that job and then changes only
  `data.schedule.status`/`updatedAt` on the document and `schedule_status` on the crew rows.
- Re-creates `get_document_by_approval_token` so the customer approval page never receives the
  schedule (run it after the approval-links migration).
