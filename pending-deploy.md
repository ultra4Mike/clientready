
## Deploy-time merge (do NOT merge before deploy)
- Visual branch cr-visual: ce53bff..8a05534 — merge at deploy time.

## Migrations (next deploy)
- 20261024140000_trial_exempt.sql, then run the set-exempt SQL (owner email placeholder)
- 20261024150000_crew_job_photo.sql
- Help branch /workspace/clientready 66033b9 (articles only) — merge at deploy time.
- Help is changing /api/stripe/readiness to return only {enabled} unauthenticated; StripeSetup.tsx now sends the owner's Bearer token (A3 follow-up commit). Verify Settings Stripe panel after their push.
