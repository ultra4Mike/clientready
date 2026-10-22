
## Deploy-time merge (do NOT merge before deploy)
- Visual branch cr-visual ed142bf..4eefd53 — ALREADY MERGED into cr-dev (8ed24d7); replaces the earlier ce53bff..8a05534 range (b0ff724 = rebased polish).

## Migrations (next deploy)
- 20261024140000_trial_exempt.sql, then run the set-exempt SQL (owner email placeholder)
- 20261024150000_crew_job_photo.sql
- Help branch /workspace/clientready 66033b9 (articles only) — merge at deploy time.
- Help is changing /api/stripe/readiness to return only {enabled} unauthenticated; StripeSetup.tsx now sends the owner's Bearer token (A3 follow-up commit). Verify Settings Stripe panel after their push.
- Help (/workspace/clientready) commits to merge at deploy: 66033b9 (articles), c1164cd (baseline RLS migration for documents/profiles, A1 — review before running), 35816c8 (A5 readiness {enabled} unless Bearer; StripeSetup already sends Bearer), 0852060 (money cross-check test; cr-dev has the fixed copy in tests/money-crosscheck.test.ts — keep ours, todos removed), 45d2986 (Getting started series + typo-tolerant help search).
- Help b6a348a (backup round-trip test; cr-dev has the fixed copy in tests/backup-restore.test.ts with todos removed — keep ours) and 13e195f (migration 20261025100000_perf_owner_worker_indexes.sql — NOT run yet; idempotent indexes, run with the other migrations and check its verification select).
