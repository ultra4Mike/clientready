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
| M5 | Do the RLS security check: follow `clientready-help/rls-audit.md` steps 1–6; only use the template `supabase/templates/base_owner_rls.REVIEW_BEFORE_RUN.sql` after review. | Owner | Done 2026-10-16 — all 6 rls-audit checks pass on live; live is_crew_email/list_crew_clients were safe for anon and are now revoked | 2026-10-15 |
| M6 | Migrations now run — next step: after M1–M2, make a real test card payment (Stripe test mode) through an approval link and the portal; confirm it appears once on the invoice with the correct local date; try two tabs at once to confirm the double-checkout guard. | Owner + Dev | Open | 2026-10-15 |
| M7 | Set Supabase env vars for builds/deploys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server: `SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, optional `BUSINESS_TIMEZONE`). Without the public ones `npm run build` fails prerendering /approve. | Owner | Open | 2026-10-15 |
| M8 | Set Business timezone in Settings once migration M1 is run. | Owner | Open | 2026-10-15 |
| M9 | Run migration `20261016000000_clients_updated_at.sql` on the live Supabase project (adds `clients.updated_at` + server touch trigger). Until it runs, the contact retry queue uses its fallback (no conditional update). | Owner | Done 2026-10-16 (run and verified on live) | 2026-10-16 |
| M10 | Run migration `20261016010000_rls_hardening.sql` on live (policies → TO authenticated, WITH CHECK on UPDATE, revoke anon table grants and authenticated TRUNCATE/TRIGGER/REFERENCES, revoke anon EXECUTE on is_crew_email/list_crew_clients). Then re-run rls-audit.md steps 1–6. | Owner | Done 2026-10-16 (run and verified on live) | 2026-10-16 |
| M11 | Supabase Auth "Confirm email" enabled, so nobody can sign up with a crew member's email (without access to that inbox) and pass as crew. | Owner | Done 2026-10-16 | 2026-10-16 |

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
| R13 | Terms of Use (`src/app/terms/page.tsx`) rewritten as a draft (2026-10-16), marked "Draft — pending owner/legal review". Owner must fill placeholders: [Company legal name], [Pricing and billing terms], [12]-month / [Liability cap to confirm], [Data retention period], [State], [Country], [County/City, State], [Support email to confirm], [Company mailing address], [Deletion response time], [Account deletion URL] (account deletion section 12a added; Privacy has matching section); then legal review. | Owner + Help | In progress 2026-10-16 — draft pending review | 2026-10-16 |

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
| S3 | **Store blocker:** no in-app account deletion (Apple requires in-app; Google requires in-app + web URL). Spec: `clientready-help/account-deletion-spec.md`. Privacy/Terms/help describe interim email route. | Dev | Open | 2026-10-16 |
| S4 | Store listing `docs/store-listing.md`: privacy/data-safety answers approved by owner 2026-10-16 (diagnostics not linked, Financial info: other, service providers not sharing, HTTPS host, web-only billing). Remaining: fill support email/URLs, retention (suggest 30 days), deletion URL; recheck after native wrapper SDKs land. | Owner + Help | In progress 2026-10-16 | 2026-10-16 |
| S5 | Onboarding tour `docs/onboarding-tour.md` (coach marks not built); upcoming-feature help drafts in `src/lib/help/upcoming.ts` (not rendered) — move into articles.ts as features ship. | Visual + Help | Open | 2026-10-16 |
| S2 | User could not edit the address on a paid invoice; suspected trial read-only lock, unconfirmed. | Dev | Waiting on user | 2026-10-16 |
