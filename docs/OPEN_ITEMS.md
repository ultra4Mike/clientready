# ClientReady — Open items (shared tracker)

Shared by the three ClientReady bots. Update the **Status** column when you pick up or close something; add new rows at the bottom of a section.

**Owners:** **Dev** = payments / Stripe / Collect code · **Visual** = Visual Design (look & feel) · **Help** = Help & Platform (help content + reliability) · **Owner** = the human business owner.
**Status values:** Open · In progress · Blocked · Done

## 1. Manual steps for the owner
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| M1 | Run migration `20261015130000_stripe_reliability.sql` in Supabase (SQL Editor → paste → Run). | Owner | Open | 2026-10-15 |
| M2 | Then run `20261015140000_checkout_guard_pending_owner.sql` (must come **after** M1). | Owner | Open | 2026-10-15 |
| M3 | Also run newer migrations `20261015150000_review_link.sql` and `20261015160000_crew_unavailable.sql` (found in git log), and confirm all older ones (000000–120000) were run. See README → Migrations. | Owner | Open | 2026-10-15 |
| M4 | Set the real support inbox: replace placeholder `SUPPORT_EMAIL = "support@clientready.app"` in `src/lib/help/articles.ts` (only TODO in the repo). | Owner → Help | Open | 2026-10-15 |
| M5 | Do the RLS security check: follow `clientready-help/rls-audit.md` steps 1–6; only use the template `supabase/templates/base_owner_rls.REVIEW_BEFORE_RUN.sql` after review. | Owner | Open | 2026-10-15 |
| M6 | After M1–M2: make a real test card payment (Stripe test mode) through an approval link and the portal; confirm it appears once on the invoice with the correct local date; try two tabs at once to confirm the double-checkout guard. | Owner + Dev | Open | 2026-10-15 |
| M7 | Set Supabase env vars for builds/deploys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server: `SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, optional `BUSINESS_TIMEZONE`). Without the public ones `npm run build` fails prerendering /approve. | Owner | Open | 2026-10-15 |
| M8 | Set Business timezone in Settings once migration M1 is run. | Owner | Open | 2026-10-15 |

## 2. Open risks
| # | Risk | Owner | Status | Added |
|---|---|---|---|---|
| R1 | Base-table RLS (documents, clients, profiles) is not in version control and unaudited. See M5. | Help | Open | 2026-10-15 |
| R2 | Overpayments are recorded, not refused; refunds are not handled in-app (Stripe dashboard + Remove payment). | Dev | Open | 2026-10-15 |
| R3 | Stuck-payment orphan: a pending payment whose invoice was deleted and whose checkout predates migration 140000 has no owner → shows in nobody's notice; needs a DB query. | Dev | Open | 2026-10-15 |
| R4 | Stuck-payment notice on Get paid loads once per page view; new stuck payments need a reload. Not shown on Dashboard. | Dev | Open | 2026-10-15 |
| R5 | Document sync is "newest updatedAt wins" using device clocks; a wrong device clock can overwrite real edits (only approvals and Stripe payments are protected). | Help | Open | 2026-10-15 |
| R6 | Client contact retry queue is per device (localStorage), not per user; a queued update can overwrite a newer edit from another device. | Help | Open | 2026-10-15 |
| R7 | README said "No service-role key is used anywhere" — now corrected (this commit). | Help | Done | 2026-10-15 |
| R8 | Privacy page (`src/app/privacy/page.tsx`) still says data stays in the browser / cloud storage not live — outdated; needs real copy (owner/legal wording). | Owner + Visual | Open | 2026-10-15 |
| R9 | Checkout claim row can be left without a session if the server crashes mid-request (ignored after 2 min; Stripe session still payable and recorded via webhook). | Dev | Open | 2026-10-15 |
| R10 | New migrations 150000 (review link) and 160000 (crew unavailable) added by other bots — confirm they degrade quietly until run. | Dev | Open | 2026-10-15 |

## 3. Help content to verify
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| H1 | Recurring invoice walkthrough ("set it to repeat" → Generate next invoice now) — click through in the app and fix wording. | Help | Done 2026-10-15 — traced in code; recurring (Recurring section → Repeat → Needs review drafts) and crew assignment (Schedule section / Calendar → + Add crew → Save schedule) rewritten | 2026-10-15 |
| H2 | Crew assignment walkthrough (add crew to job / Remove from job) — verify the real flow. | Help | Done 2026-10-15 — crew assignment flow traced and fixed (see H1) | 2026-10-15 |
| H3 | Spot-check button/screen names in all 90 articles against the current UI (UI changed since: timezone combobox, review request, crew unavailable, timesheet CSV, Mark paid in cash). | Help | Done 2026-10-15 — labels re-verified; fixed receipt, manual payment, deposit, crew done/report/drafts, on my way, client remove/contact, schedule/repeat, portal/link revoke, clock fix | 2026-10-15 |
| H4 | Add articles for features shipped after the help pass: review request after payment, crew "mark unavailable", timesheet CSV export, late-fee settings, timezone combobox search. | Help | Done 2026-10-15 — added review-request, crew-unavailable, timesheet-csv, late-fee-settings; timezone article rewritten for search box | 2026-10-15 |

## 4. Pending handoffs
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| P1 | Dev to review payment commits `7b27e47` (webhook pending/idempotency, checkout reuse, client-sync queue) and `a12ed9b` (pending route, StuckPayments, checkout claim guard), and add tests (no test runner exists yet). Note: a12ed9b also fixed a query-builder reuse bug from 7b27e47. | Dev | Open | 2026-10-15 |

## 5. Lint debt
| # | Item | Owner | Status | Added |
|---|---|---|---|---|
| L1 | `src/components/AppShell.tsx`: react-hooks/set-state-in-effect (theme read in effect) — pre-existing. | Visual | Open | 2026-10-15 |
| L2 | `src/app/collect/page.tsx`: 2 pre-existing lint errors (set-state-in-effect; "value cannot be modified"). | Dev | Open | 2026-10-15 |
