
## Merge at deploy time (not before)
- Visual: e4c7121..a03997d (cr-visual)
- Help: 81d37e6..789b1d1 (/workspace/clientready master)

## Deploy 4 (2026-10-21)
- Merged Visual e4c7121..a03997d and Help 81d37e6..789b1d1 into cr-dev; full suite 138 passed / 3 expected reimb failures.
- Migrations (all 6) already run by the owner via migrations-20.sql; 23 checks true.
- STILL PENDING: unique index documents_owner_number_unique — run Documents > "Fix duplicate numbers", then re-run section 6 (doc_numbers) of /workspace/clientready-migrations-20.sql.
