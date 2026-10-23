-- Time tracking phase 1: new taps (Start day, Start/End break, End day), server vs phone time, out-of-order confirm,
-- owner note on fix requests, all timesheet rules as one JSON column, owner-only audit log (never deleted),
-- weekly worker attestation. Idempotent: safe to run more than once. The live app keeps working before and after.
-- Workers: still no price columns anywhere; they read only their own rows and write only through crew_* functions.

-- 1) Tap kinds: old kinds stay valid (end_shift is read as End day).
alter table public.crew_day_events drop constraint if exists crew_day_events_kind_check;
alter table public.crew_day_events add constraint crew_day_events_kind_check
  check (kind in ('start_day', 'start_job', 'start_transit', 'arrive', 'break_start', 'break_end', 'end_day', 'end_shift'));
alter table public.crew_time_fixes drop constraint if exists crew_time_fixes_kind_check;
alter table public.crew_time_fixes add constraint crew_time_fixes_kind_check
  check (kind in ('start_day', 'start_job', 'start_transit', 'arrive', 'break_start', 'break_end', 'end_day', 'end_shift'));

-- 2) Server time + phone time + out-of-order confirm on taps; owner note on fixes; rules JSON on settings.
alter table public.crew_day_events add column if not exists device_at timestamptz;
alter table public.crew_day_events add column if not exists out_of_order boolean not null default false;
alter table public.crew_time_fixes add column if not exists owner_note text check (owner_note is null or length(owner_note) <= 300);
alter table public.crew_timesheet_settings add column if not exists rules jsonb not null default '{}'::jsonb;

-- Old 8-argument tap function (used by the app version live today): now also accepts the new kinds.
create or replace function public.crew_add_day_event(p_id text, p_kind text, p_at timestamptz, p_work_date date, p_doc_id text default '',
  p_lat double precision default null, p_lng double precision default null, p_not_at_site boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if p_kind not in ('start_day', 'start_job', 'start_transit', 'arrive', 'break_start', 'break_end', 'end_day', 'end_shift') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
  if abs(extract(epoch from (p_at - now()))) > 3 * 86400 then raise exception 'time is not valid' using errcode = 'P0001'; end if;
  if coalesce(p_doc_id, '') <> '' then
    select * into a from public.crew_assignment(p_doc_id);
  else
    select j.owner_id, coalesce(j.employee_id, '') as employee_id into a from public.crew_jobs j
     where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1;
  end if;
  if a.owner_id is null then raise exception 'not assigned to this job' using errcode = '42501'; end if;
  insert into public.crew_day_events (id, owner_id, employee_id, worker_email, work_date, kind, at, doc_id, lat, lng, not_at_site)
  values (left(p_id, 80), a.owner_id, a.employee_id, public.crew_email(), p_work_date, p_kind, p_at, coalesce(p_doc_id, ''), p_lat, p_lng, coalesce(p_not_at_site, false))
  on conflict (id) do nothing;
  return true;
end $$;

-- New 10-argument tap function (p_device_at / p_out_of_order are required, so PostgREST never confuses the two).
-- A live tap (phone time within 10 minutes of the server) is stored at the SERVER time; a queued offline tap keeps
-- the phone time. The phone time is always kept in device_at so a wrong phone clock can be flagged.
create or replace function public.crew_add_day_event(p_id text, p_kind text, p_at timestamptz, p_work_date date, p_doc_id text,
  p_lat double precision, p_lng double precision, p_not_at_site boolean, p_device_at timestamptz, p_out_of_order boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare a record; t timestamptz;
begin
  if p_kind not in ('start_day', 'start_job', 'start_transit', 'arrive', 'break_start', 'break_end', 'end_day', 'end_shift') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
  if abs(extract(epoch from (p_at - now()))) > 3 * 86400 then raise exception 'time is not valid' using errcode = 'P0001'; end if;
  t := case when abs(extract(epoch from (p_at - now()))) <= 600 then now() else p_at end;
  if coalesce(p_doc_id, '') <> '' then
    select * into a from public.crew_assignment(p_doc_id);
  else
    select j.owner_id, coalesce(j.employee_id, '') as employee_id into a from public.crew_jobs j
     where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1;
  end if;
  if a.owner_id is null then raise exception 'not assigned to this job' using errcode = '42501'; end if;
  insert into public.crew_day_events (id, owner_id, employee_id, worker_email, work_date, kind, at, doc_id, lat, lng, not_at_site, device_at, out_of_order)
  values (left(p_id, 80), a.owner_id, a.employee_id, public.crew_email(), p_work_date, p_kind, t, coalesce(p_doc_id, ''), p_lat, p_lng,
    coalesce(p_not_at_site, false), coalesce(p_device_at, p_at), coalesce(p_out_of_order, false))
  on conflict (id) do nothing;
  return true;
end $$;
revoke all on function public.crew_add_day_event(text, text, timestamptz, date, text, double precision, double precision, boolean, timestamptz, boolean) from public, anon;
grant execute on function public.crew_add_day_event(text, text, timestamptz, date, text, double precision, double precision, boolean, timestamptz, boolean) to authenticated;
revoke all on function public.crew_add_day_event(text, text, timestamptz, date, text, double precision, double precision, boolean) from public, anon;
grant execute on function public.crew_add_day_event(text, text, timestamptz, date, text, double precision, double precision, boolean) to authenticated;

-- 3) Audit log: who changed what and when. Owner reads/inserts; nobody updates or deletes (kept 3+ years).
create table if not exists public.crew_time_audit (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  at timestamptz not null default now(),
  actor_email text not null default '',
  employee_id text not null default '',
  work_date date,
  action text not null check (length(action) between 1 and 60),
  old_value jsonb,
  new_value jsonb
);
create index if not exists crew_time_audit_owner_idx on public.crew_time_audit (owner_id, at desc);
create index if not exists crew_time_audit_day_idx on public.crew_time_audit (owner_id, employee_id, work_date);
alter table public.crew_time_audit enable row level security;
drop policy if exists crew_time_audit_owner_read on public.crew_time_audit;
drop policy if exists crew_time_audit_owner_insert on public.crew_time_audit;
create policy crew_time_audit_owner_read on public.crew_time_audit for select to authenticated using (owner_id = auth.uid());
create policy crew_time_audit_owner_insert on public.crew_time_audit for insert to authenticated with check (owner_id = auth.uid());
revoke all on public.crew_time_audit from anon;
revoke update, delete, truncate on public.crew_time_audit from authenticated;
grant select, insert on public.crew_time_audit to authenticated;

create or replace function public.crew_time_audit_lock() returns trigger language plpgsql as $$
begin raise exception 'audit rows cannot be changed or deleted' using errcode = '42501'; end $$;
drop trigger if exists crew_time_audit_no_change on public.crew_time_audit;
create trigger crew_time_audit_no_change before update or delete on public.crew_time_audit for each row execute function public.crew_time_audit_lock();

-- Every tap (worker or owner) and every fix-request decision is logged by the database itself.
create or replace function public.crew_time_audit_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'crew_day_events' then
    if tg_op = 'INSERT' then
      insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
      values (new.owner_id, coalesce(new.worker_email, ''), new.employee_id, new.work_date, 'tap', null,
        jsonb_build_object('kind', new.kind, 'at', new.at, 'device_at', new.device_at, 'doc_id', new.doc_id, 'not_at_site', new.not_at_site, 'out_of_order', new.out_of_order));
    elsif tg_op = 'UPDATE' then
      insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
      values (new.owner_id, coalesce(auth.jwt() ->> 'email', ''), new.employee_id, new.work_date, 'tap_edit',
        jsonb_build_object('kind', old.kind, 'at', old.at), jsonb_build_object('kind', new.kind, 'at', new.at));
    else
      insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
      values (old.owner_id, coalesce(auth.jwt() ->> 'email', ''), old.employee_id, old.work_date, 'tap_delete', jsonb_build_object('kind', old.kind, 'at', old.at), null);
    end if;
  elsif tg_table_name = 'crew_time_fixes' and tg_op = 'INSERT' then
    insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
    values (new.owner_id, new.worker_email, new.employee_id, new.work_date, 'fix_request', null, jsonb_build_object('kind', new.kind, 'at', new.at, 'reason', new.reason));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists crew_day_events_audit on public.crew_day_events;
create trigger crew_day_events_audit after insert or update or delete on public.crew_day_events for each row execute function public.crew_time_audit_events();
drop trigger if exists crew_time_fixes_audit on public.crew_time_fixes;
create trigger crew_time_fixes_audit after insert on public.crew_time_fixes for each row execute function public.crew_time_audit_events();

-- 4) Weekly attestation: the worker confirms his week's hours (minutes only, no money), with a timestamp.
create table if not exists public.crew_week_attestations (
  owner_id uuid not null,
  employee_id text not null,
  worker_email text not null,
  week_start date not null,
  minutes integer not null default 0,
  attested_at timestamptz not null default now(),
  primary key (owner_id, employee_id, week_start)
);
alter table public.crew_week_attestations enable row level security;
drop policy if exists crew_week_attestations_owner on public.crew_week_attestations;
drop policy if exists crew_week_attestations_worker_read on public.crew_week_attestations;
create policy crew_week_attestations_owner on public.crew_week_attestations for select to authenticated using (owner_id = auth.uid());
create policy crew_week_attestations_worker_read on public.crew_week_attestations for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
grant select on public.crew_week_attestations to authenticated;

create or replace function public.crew_attest_week(p_week date, p_minutes integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select j.owner_id, coalesce(j.employee_id, '') as employee_id into a from public.crew_jobs j
   where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1;
  if a.owner_id is null then raise exception 'not on a crew' using errcode = '42501'; end if;
  insert into public.crew_week_attestations (owner_id, employee_id, worker_email, week_start, minutes)
  values (a.owner_id, a.employee_id, public.crew_email(), p_week, greatest(0, coalesce(p_minutes, 0)))
  on conflict (owner_id, employee_id, week_start) do update set minutes = excluded.minutes, attested_at = now();
  insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
  values (a.owner_id, public.crew_email(), a.employee_id, p_week, 'attest', null, jsonb_build_object('minutes', p_minutes));
  return true;
end $$;
revoke all on function public.crew_attest_week(date, integer) from public, anon;
grant execute on function public.crew_attest_week(date, integer) to authenticated;

-- 5) Worker: read the account's time rules (breaks, rounding, geofence; never any price) so My day matches the owner.
-- Per-worker time overrides (owner-edited; employees RLS unchanged): {"breakPreset": ""|"federal"|"california", "geofenceOptOut": bool}
alter table public.employees add column if not exists time_overrides jsonb default '{}'::jsonb;

create or replace function public.crew_time_rules()
returns jsonb language sql stable security definer set search_path = public as $$
  -- Account rules plus this worker's own overrides as "worker" (break preset, geofence opt-out, hire date; no pay fields).
  with o as (select j.owner_id, j.employee_id from public.crew_jobs j where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1)
  select coalesce(s.rules, '{}'::jsonb) || jsonb_build_object('gapMinutes', s.gap_minutes, 'transitTimeoutMinutes', s.transit_timeout_minutes)
    || jsonb_build_object('worker', coalesce((select jsonb_build_object('breakPreset', coalesce(e.time_overrides->>'breakPreset', ''), 'geofenceOptOut', coalesce((e.time_overrides->>'geofenceOptOut')::boolean, false), 'hireDate', coalesce(e.hire_date, ''))
      from public.employees e where e.user_id = o.owner_id and e.id = o.employee_id limit 1), '{}'::jsonb))
  from o join public.crew_timesheet_settings s on s.owner_id = o.owner_id
$$;
revoke all on function public.crew_time_rules() from public, anon;
grant execute on function public.crew_time_rules() to authenticated;

-- Checks (each returns TRUE):
-- select pg_get_constraintdef(oid) like '%break_start%' and pg_get_constraintdef(oid) like '%end_shift%' as tap_kinds_ready from pg_constraint where conname = 'crew_day_events_kind_check';
-- select count(*) = 2 as event_columns_ready from information_schema.columns where table_schema = 'public' and table_name = 'crew_day_events' and column_name in ('device_at', 'out_of_order');
-- select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crew_timesheet_settings' and column_name = 'rules') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crew_time_fixes' and column_name = 'owner_note') as settings_and_note_ready;
-- select to_regprocedure('public.crew_add_day_event(text,text,timestamptz,date,text,double precision,double precision,boolean)') is not null and to_regprocedure('public.crew_add_day_event(text,text,timestamptz,date,text,double precision,double precision,boolean,timestamptz,boolean)') is not null as tap_functions_ready;
-- select relrowsecurity as audit_rls_on from pg_class where relname = 'crew_time_audit';
-- select count(*) = 2 and bool_and(cmd in ('SELECT', 'INSERT')) as audit_owner_only from pg_policies where schemaname = 'public' and tablename = 'crew_time_audit';
-- select count(*) = 3 as audit_triggers_ready from pg_trigger where tgname in ('crew_time_audit_no_change', 'crew_day_events_audit', 'crew_time_fixes_audit');
-- select exists (select 1 from pg_class where relname = 'crew_week_attestations' and relrowsecurity) and to_regprocedure('public.crew_attest_week(date,integer)') is not null and to_regprocedure('public.crew_time_rules()') is not null as attestation_ready;
-- select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employees' and column_name = 'time_overrides') as worker_overrides_ready;
-- select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('crew_day_events', 'crew_time_fixes', 'crew_week_attestations') and column_name ~ '(rate|pay|price|amount)') as no_price_columns_for_workers;
