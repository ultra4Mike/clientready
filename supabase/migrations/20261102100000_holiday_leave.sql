-- deploy13: Holiday leave type (paid holiday the owner adds). Idempotent; safe to run more than once.
-- Only widens the crew_pto_requests.kind check to allow 'holiday'. No data changes, no pay changes.
-- Workers still can't ask for holiday themselves (crew_request_pto keeps 'pto'/'sick' only); the owner adds it.
-- Workers still read only their own rows (existing crew_pto_requests_worker_read policy, unchanged).
do $$
declare c record;
begin
  if to_regclass('public.crew_pto_requests') is null then raise exception 'crew_pto_requests missing'; end if;
  for c in select conname from pg_constraint
            where conrelid = 'public.crew_pto_requests'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.crew_pto_requests drop constraint %I', c.conname);
  end loop;
  alter table public.crew_pto_requests add constraint crew_pto_requests_kind_check check (kind in ('pto', 'sick', 'holiday'));
end $$;

-- Checks (expect: kind_check_ok = true, bad_kinds = 0, worker_policy = 1)
select pg_get_constraintdef(oid) ilike '%holiday%' as kind_check_ok from pg_constraint
 where conrelid = 'public.crew_pto_requests'::regclass and conname = 'crew_pto_requests_kind_check';
select count(*) as bad_kinds from public.crew_pto_requests where kind not in ('pto', 'sick', 'holiday');
select count(*) as worker_policy from pg_policies where tablename = 'crew_pto_requests' and policyname = 'crew_pto_requests_worker_read';
