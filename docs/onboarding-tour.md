# Onboarding: first-run checklist and tour (draft)

Labels match the app on 2026-10-16 (`src/lib/getting-started.ts`, `GettingStarted.tsx`, nav in `AppShell`/`MobileNav`).

## First-run checklist (Getting started card on Dashboard — already built)
1. **Add your logo** → Settings (`/profile#payments`)
2. **Add your first client** → Clients
3. **Send your first invoice** → New invoice
4. **Set how customers pay (pay link or card payments)** → Settings → Payment methods → **Save payment methods**
5. **Record your first payment** → Collect
Done state: "You are all set up."
Suggestion for Dev/Visual: item 4 label should mention Zelle/Venmo/etc. now that manual methods shipped.

## Tour steps (proposed coach marks; not built)
1. **Dashboard** — "Your day at a glance: Needs review, unpaid invoices, upcoming jobs. The Getting started card shows what's left."
2. **+ (quick create)** — "Start a New invoice or New proposal from anywhere."
3. **Clients** — "Every client's contact info, documents and history."
4. **Calendar** — "Schedule jobs and add crew."
5. **Collect** — "What you're owed. Mark paid when money arrives."
6. **More / Settings** — "Business info, Payment methods, timezone and login."
7. **Help** — "Search 98 how-to articles any time."
Mobile: steps 3–6 point to the bottom tabs and More.

## Matching help articles (src/lib/help/articles.ts)
`first-run-tour`, `payment-methods-setup` (new), plus existing `getting-started-checklist`, `nav-tour`, `business-info`, `dashboard`. Account: `delete-account` (new, interim email route).
