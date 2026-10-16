# ClientReady — Open items (shared tracker)

Shared by the three ClientReady bots. Update the **Status** column when you pick up or close something; add new rows at the bottom of a section.

**Owners:** **Dev** = payments / Stripe / Collect code · **Visual** = Visual Design (look & feel) · **Help** = Help & Platform (help content + reliability) · **Owner** = the human business owner.
**Status values:** Open · In progress · Blocked · Done

## 1. Manual steps for the owner
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| M1 | Run migration `20261015130000_stripe_reliability.sql` in Supabase (SQL Editor → paste → Run). | Owner | Done 2026-10-16 (run and verified) | 2026-10-15 |
| M2 | Then run `20261015140000_checkout_guard_pending_owner.sql` (must come **after** M1). | Owner | Done 2026-10-16 (run and verified) | 2026-10-15 |
| M3 | Also run newer migrations `20261015150000_review_link.sql` and `20261015160000_crew_unavailable.sql` (found in git log), and confirm all older ones (000000–120000) were run. See README → Migrations. | Owner | Partly done 2026-10-16 — 030000, 130000, 140000, 150000, 160000 run and verified; confirm the other older migrations (000000–120000 except 030000) | 2026-10-15 |
| M4 | Set the real support inbox: replace placeholder `SUPPORT_EMAIL = "support@clientready.app"` in `src/lib/help/articles.ts` (only TODO in the repo). | Owner → Help | Open | 2026-10-15 |
| M15 | Production domain: https://clientreadyapp.com live (www works; old Vercel URL still works). Docs, Privacy/Terms, store listing, help updated by Help. Owner still to update Supabase Auth Site URL/redirects, Stripe webhook endpoint, Resend domain, site URL env vars; Dev updating code/Capacitor/deep links. | Owner + Help + Dev | Done 2026-10-16 (domain live; docs updated) | 2026-10-16 |
| M16 | Run Dev's new migrations in order on live Supabase: `20261016100000_crew_upload_keys.sql`, `20261016110000_job_checklist.sql`, `20261016120000_crew_cost_categories.sql` (all add-only, re-runnable; verified clean on a local copy 2026-10-16). Until 120000 runs, job-report cost lines are saved only as a total. | Owner | Open | 2026-10-16 |
| M5 | Do the RLS security check: follow `clientready-help/rls-audit.md` steps 1–6; only use the template `supabase/templates/base_owner_rls.REVIEW_BEFORE_RUN.sql` after review. | Owner | Done 2026-10-16 — all 6 rls-audit checks pass on live; live is_crew_email/list_crew_clients were safe for anon and are now revoked | 2026-10-15 |
| M6 | Migrations now run — next step: after M1–M2, make a real test card payment (Stripe test mode) through an approval link and the portal; confirm it appears once on the invoice with the correct local date; try two tabs at once to confirm the double-checkout guard. | Owner + Dev | Open | 2026-10-15 |
| M7 | Set Supabase env vars for builds/deploys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server: `SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, optional `BUSINESS_TIMEZONE`). Without the public ones `npm run build` fails prerendering /approve. | Owner | Open | 2026-10-15 |
| M8 | Set Business timezone in Settings once migration M1 is run. | Owner | Open | 2026-10-15 |
| M9 | Run migration `20261016000000_clients_updated_at.sql` on the live Supabase project (adds `clients.updated_at` + server touch trigger). Until it runs, the contact retry queue uses its fallback (no conditional update). | Owner | Done 2026-10-16 (run and verified on live) | 2026-10-16 |
| M10 | Run migration `20261016010000_rls_hardening.sql` on live (policies → TO authenticated, WITH CHECK on UPDATE, revoke anon table grants and authenticated TRUNCATE/TRIGGER/REFERENCES, revoke anon EXECUTE on is_crew_email/list_crew_clients). Then re-run rls-audit.md steps 1–6. | Owner | Done 2026-10-16 (run and verified on live) | 2026-10-16 |
| M11 | Supabase Auth "Confirm email" enabled, so nobody can sign up with a crew member's email (without access to that inbox) and pass as crew. | Owner | Done 2026-10-16 | 2026-10-16 |
| M12 | In hosting env set `SUPABASE_SERVICE_ROLE_KEY` (server only; without it /account/delete only says email support) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (without it Notifications says not available yet). Also run migrations `20261016080000_account_deletion.sql` and `20261016090000_push_subscriptions.sql`. | Owner | Open | 2026-10-16 |

## 2. Open risks
| # | Risk | Owner | Status | Added |
|---|---|---|---|---|
| R1 | Base-table RLS (documents, clients, profiles) is not in version control and unaudited. See M5. | Help | Done 2026-10-16 — audited and hardened (M5, M10) | 2026-10-15 |
| R2 | Overpayments are recorded, not refused; refunds are not handled in-app (Stripe dashboard + Remove payment). | Dev | Open | 2026-10-15 |
| R3 | Stuck-payment orphan: a pending payment whose invoice was deleted and whose checkout predates migration 140000 has no owner → shows in nobody's notice; needs a DB query. | Dev | Open | 2026-10-15 |
| R4 | Stuck-payment notice on Get paid loads once per page view; new stuck payments need a reload. Not shown on Dashboard. | Dev | Open | 2026-10-15 |
| R5 | Document sync is "newest updatedAt wins" using device clocks; a wrong device clock can overwrite real edits (only approvals and Stripe payments are protected). | Help | Open | 2026-10-15 |
| R6 | Client contact retry queue is per device (localStorage), not per user; a queued update can overwrite a newer edit from another device. | Help | Done 2026-10-16 — see R12 | 2026-10-15 |
| R7 | README said "No service-role key is used anywhere" — now corrected (this commit). | Help | Done | 2026-10-15 |
| R8 | Privacy page (`src/app/privacy/page.tsx`) still says data stays in the browser / cloud storage not live — outdated; needs real copy (owner/legal wording). | Owner + Visual | In progress 2026-10-16 — draft text in place, marked for owner/legal review | 2026-10-15 |
| R9 | Checkout claim row can be left without a session if the server crashes mid-request (ignored after 2 min; Stripe session still payable and recorded via webhook). | Dev | Open | 2026-10-15 |
| R10 | New migrations 150000 (review link) and 160000 (crew unavailable) added by other bots — confirm they degrade quietly until run. | Dev | Open | 2026-10-15 |
| R11 | Pending-payments list (`/api/pay/pending`) reads at most 200 unresolved rows across **all** owners before filtering to the signed-in owner, so with many unresolved rows an owner's stuck payment may not show. Fix belongs in payment code — coordinate with Dev before changing. | Help (with Dev) | Open | 2026-10-16 |
| R12 | Client contact retry queue was not account-scoped (could be dropped after an account switch; a retry could overwrite a newer cloud edit). Fixed in `src/lib/client-sync.ts`: queue keyed per user id; update skipped when the cloud row's `updated_at` is newer than the queued change (only if the clients table has `updated_at`); old shared queue dropped. Follow-up 2026-10-16: conditional update on the stored `updated_at` baseline (no device clocks), superseded changes dropped, queue merged on write-back so edits made during a flush are kept. Needs M9. | Help | Done 2026-10-16 | 2026-10-16 |
| R13 | Terms of Use (`src/app/terms/page.tsx`) rewritten as a draft (2026-10-16), marked "Draft — pending owner/legal review". Owner must fill placeholders: [Company legal name], [Pricing and billing terms], [12]-month / [Liability cap to confirm], [Data retention period], [State], [Country], [County/City, State], [Support email to confirm], [Company mailing address], [Deletion response time] (deletion URL filled 2026-10-16: https://clientreadyapp.com/account/delete) (account deletion section 12a added; Privacy has matching section); then legal review. | Owner + Help | In progress 2026-10-16 — draft pending review | 2026-10-16 |
| R14 | Offline photo queue: if the server saved a crew upload but the reply was lost (signal dropped), the item is queued and resent, so `crew_mark_done` inserts the photos again and `crew_add_expense` adds a **duplicate expense** (crew spend overstated). Needs a client idempotency key per queue item + unique column/check in both RPCs (migration). | Dev | Done 2026-10-16 (Dev 10e75d4: client_key + unique index, migration 20261016100000; job reports keyed by row id in c481312) | 2026-10-16 |
| R15 | Photo queue survives Log out (only account deletion wipes it). Items are tagged by user id and only sent for that user, so no wrong-owner upload, but on a shared phone another person's unsent job photos stay in IndexedDB. Recommend: on Log out with queued items, warn ("N uploads not sent yet") and wipe only that user's items if they continue. | Dev | Done 2026-10-16 (Dev 10e75d4) — verify logout warning in app | 2026-10-16 |
| R16 | Photo queue fixes by Help (this commit): one flush at a time per tab (online event + load + Send now could double-send); ask for persistent storage on enqueue (eviction); a full-storage save error is now shown instead of leaving the button stuck and losing the photos silently. | Help | Done 2026-10-16 | 2026-10-16 |
| R17 | Photos are not in Supabase Storage: done photos / receipts are base64 JPEG data URLs in table rows (`crew_job_photos`, `crew_expenses`) and owner job photos in documents data. No storage bucket, so no storage.objects policies needed; table RLS checked (owner all, crew read own). DB growth: up to 6 × 700 KB per mark-done; consider moving to a private bucket later. | Dev | Open (later) | 2026-10-16 |
| R18 | Crew report double-count: opening the same crew draft with Open as invoice twice makes two invoices that both carry `crewReport`; tapping Use crew amount / Add all on both counts the costs twice in job costs and Reports. Recommend: stamp the draft (e.g. `opened_doc_id`/`opened_at`) on first open and warn or reopen that invoice, or ignore a `crewReport.draftId` already used by another document. | Dev | Open | 2026-10-16 |
| R19 | Job report retry treats any 23505 (duplicate id) as "already sent". Keys are random (`q`+time+8 chars) so a collision with another row is very unlikely, but it would silently drop that report. Optional: on 23505, re-read the row by id and confirm worker_email matches. | Dev | Open (low) | 2026-10-16 |
| R20 | Audit 2026-10-16 (Help, local Postgres with all migrations): crew can't read documents (prices/estimates/job costs); crew_jobs only own rows (columns: own rate/pay, client contact, checklist; no invoice prices); job_drafts crew insert-own/read-own, no update (no edits after submit); crew_check_item refuses non-assigned and anon; no anon table grants; every ALL/INSERT/UPDATE policy has WITH CHECK; 'Add all' sets (not adds) so a second tap is a no-op. Minor: crew_jobs.status mirrors the invoice status (e.g. paid) to crew — pre-existing, not a price. | Help | Done 2026-10-16 | 2026-10-16 |

## 3. Help content to verify
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| H1 | Recurring invoice walkthrough ("set it to repeat" → Generate next invoice now) — click through in the app and fix wording. | Help | Done 2026-10-15 — traced in code; recurring (Recurring section → Repeat → Needs review drafts) and crew assignment (Schedule section / Calendar → + Add crew → Save schedule) rewritten | 2026-10-15 |
| H2 | Crew assignment walkthrough (add crew to job / Remove from job) — verify the real flow. | Help | Done 2026-10-15 — crew assignment flow traced and fixed (see H1) | 2026-10-15 |
| H3 | Spot-check button/screen names in all 90 articles against the current UI (UI changed since: timezone combobox, review request, crew unavailable, timesheet CSV, Mark paid in cash). | Help | Done 2026-10-15 — labels re-verified; fixed receipt, manual payment, deposit, crew done/report/drafts, on my way, client remove/contact, schedule/repeat, portal/link revoke, clock fix | 2026-10-15 |
| H4 | Add articles for features shipped after the help pass: review request after payment, crew "mark unavailable", timesheet CSV export, late-fee settings, timezone combobox search. | Help | Done 2026-10-15 — added review-request, crew-unavailable, timesheet-csv, late-fee-settings; timezone article rewritten for search box | 2026-10-15 |
| H5 | Articles for features shipped 2026-10-15/16: global search, route map, travel warning, documents bulk, reports CSV + Schedule C, mileage, inventory, job packages, tips, client preferences, before/after tags, job messages, follow-ups, ratings, plans, job photos/offline queue; Zelle/Venmo/Cash App, PayPal, check/ACH moved from upcoming.ts. | Help | Done 2026-10-16 | 2026-10-16 |
| H6 | Crew costs + checklist help (c481312, 27b7b12): job-report (cost lines by category, receipts, Add another cost), crew-expenses (6 categories), crew-done (checklist gate), new job-checklist and crew-costs-review (Crew spend vs your estimate, Use crew amount, Add all crew amounts). | Help | Done 2026-10-16 | 2026-10-16 |

## 4. Pending handoffs
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| P1 | Dev to review payment commits `7b27e47` (webhook pending/idempotency, checkout reuse, client-sync queue) and `a12ed9b` (pending route, StuckPayments, checkout claim guard), and add tests (no test runner exists yet). Note: a12ed9b also fixed a query-builder reuse bug from 7b27e47. | Dev | Done 2026-10-16 — Dev reviewed 7b27e47/a12ed9b: no blockers, suites pass | 2026-10-15 |

## 5. Lint debt
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| L1 | `src/components/AppShell.tsx`: react-hooks/set-state-in-effect (theme read in effect) — pre-existing. | Visual | Done 2026-10-16 (Help: setState deferred one microtask, same pattern as fae8b09) | 2026-10-15 |
| L2 | `src/app/collect/page.tsx`: 2 pre-existing lint errors (set-state-in-effect; "value cannot be modified"). | Dev | Open | 2026-10-15 |

## 6. Product / support follow-ups
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| S1 | Paid plans / billing after the 14-day trial. Needs Stripe Billing, so it goes last under the user's "no outside accounts first" rule. | Dev | Not started | 2026-10-16 |
| S3 | Account deletion: Dev shipped /account/delete (in-app + public web URL) in 9f81fdd; Privacy/Terms/help/store listing updated. Works only once M12 is done. | Dev | Done 2026-10-16 (Dev part) | 2026-10-16 |
| S4 | Store listing `docs/store-listing.md`: privacy/data-safety answers approved by owner 2026-10-16 (diagnostics not linked, Financial info: other, service providers not sharing, HTTPS host, web-only billing). URLs filled 2026-10-16 for clientreadyapp.com (/help, /, /privacy, /terms, /account/delete); @capacitor/camera 8.2.5 recorded (no new data types). Remaining: support email, retention (suggest 30 days); native SDK recheck done 2026-10-16 (36f18fc: no new data types, tracking No); confirm placeholder app id `app.clientready.mobile`. | Owner + Help | In progress 2026-10-16 | 2026-10-16 |
| S5 | Onboarding tour `docs/onboarding-tour.md` (coach marks not built); upcoming-feature help drafts in `src/lib/help/upcoming.ts` (not rendered) — move into articles.ts as features ship. | Visual + Help | In progress 2026-10-16 — manual payment articles moved into articles.ts; remaining drafts (card Connect, auto reminders, SMS) wait on unbuilt features | 2026-10-16 |
| S2 | User could not edit the address on a paid invoice; suspected trial read-only lock, unconfirmed. | Dev | Waiting on user | 2026-10-16 |
| S6 | Apple Guideline 4.2 risk (WebView wrapper). Add native touches before iOS submission: camera/photo picker (done 5fbf887 + offline queue fa211eb), native push, offline, deep links; demo login for review. See docs/store-listing.md. | Dev + Owner | In progress 2026-10-16 — camera done | 2026-10-16 |
