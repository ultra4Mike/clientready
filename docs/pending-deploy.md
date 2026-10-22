
## Merge at deploy time (not before)
- Visual: e4c7121..a03997d (cr-visual)
- Help: 81d37e6..789b1d1 (/workspace/clientready master)

## Deploy 4 (2026-10-21)
- Merged Visual e4c7121..a03997d and Help 81d37e6..789b1d1 into cr-dev; full suite 138 passed / 3 expected reimb failures.
- Migrations (all 6) already run by the owner via migrations-20.sql; 23 checks true.
- STILL PENDING: unique index documents_owner_number_unique — run Documents > "Fix duplicate numbers", then re-run section 6 (doc_numbers) of /workspace/clientready-migrations-20.sql.

## Next deploy (after Deploy 4)
- New migration: 20261024140000_trial_exempt.sql (developer trial exemption). After running it, set the ONE exempt account:
  update public.profiles set trial_exempt = true where id = (select id from auth.users where lower(email) = lower('<OWNER_LOGIN_EMAIL — Michael Henderson>'));
  Check: select p.id, u.email, p.trial_exempt from public.profiles p join auth.users u on u.id = p.id where p.trial_exempt;
- Still pending from Deploy 4: unique doc-number index (Fix duplicate numbers, then re-run doc_numbers section 6).

## Deploy 5 (2026-10-21)
Merged: cr-visual ed142bf..4eefd53; Help 34601d0..0ad76d7 (14 commits; 0852060/b6a348a test files superseded by cr-dev versions with todos passing). Migrations: /workspace/clientready-migrations-21.sql.
