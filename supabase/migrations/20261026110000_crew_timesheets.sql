-- Crew day timesheets: tap events (Start job / Start driving / Arrive / End shift), fix-my-time requests,
-- day approvals (hours only, never money) and the owner's timesheet settings.
-- Idempotent: safe to run more than once. The app falls back to this phone's storage until it is run.
-- Workers: read only their own rows, write only through the crew_* functions below. No price columns anywhere.

create table if not exists public.crew_day_events (
  id text primary key,
  owner_id uuid not null,
  employee_id text not null default '',
  worker_email text not null,
  work_date date not null,
  kind text not null check (kind in ('start_job', 'start_transit', 'arrive', 'end_shift')),
  at timestamptz not null,
  doc_id text not null default '',
  lat double precision,
  lng double precision,
  not_at_site boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists crew_day_events_owner_idx on public.crew_day_events (owner_id, work_date);
create index if not exists crew_day_events_worker_idx on public.crew_day_events (lower(worker_email), work_date);

create table if not exists public.crew_time_fixes (
  id text primary key,
  owner_id uuid not null,
  employee_id text not null default '',
  worker_email text not null,
  work_date date not null,
  event_id text,
  kind text not null check (kind in ('start_job', 'start_transit', 'arrive', 'end_shift')),
  at timestamptz not null,
  doc_id text not null default '',
  reason text not null check (length(reason) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists crew_time_fixes_owner_idx on public.crew_time_fixes (owner_id, status);

create table if not exists public.crew_day_approvals (
  owner_id uuid not null,
  employee_id text not null,
  work_date date not null,
  paid_minutes numeric not null default 0,
  drive_minutes numeric not null default 0,
  edited_minutes numeric,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, employee_id, work_date)
);

create table if not exists public.crew_timesheet_settings (
  owner_id uuid primary key,
  gap_minutes integer not null default 60 check (gap_minutes between 0 and 600),
  transit_timeout_minutes integer not null default 120 check (transit_timeout_minutes between 15 and 720),
  half_day_hours numeric not null default 4,
  updated_at timestamptz not null default now()
);
-- Edited or fixed after approval: approval cleared, the owner approves again.
alter table public.crew_day_approvals add column if not exists changed_at timestamptz;
-- First day crew pay comes from the approved day timesheet: one per owner, shared by every device.
alter table public.crew_timesheet_settings add column if not exists pay_cutover date;

do $$
declare t text; pol record;
begin
  foreach t in array array['crew_day_events', 'crew_time_fixes', 'crew_day_approvals', 'crew_timesheet_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

create policy crew_day_events_owner on public.crew_day_events for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_day_events_worker_read on public.crew_day_events for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
create policy crew_time_fixes_owner on public.crew_time_fixes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_time_fixes_worker_read on public.crew_time_fixes for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
create policy crew_day_approvals_owner on public.crew_day_approvals for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_timesheet_settings_owner on public.crew_timesheet_settings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.crew_day_events, public.crew_time_fixes, public.crew_day_approvals, public.crew_timesheet_settings to authenticated;

-- A worker's tap. Only for a job he is assigned to (end_shift may have no job: uses his latest owner).
create or replace function public.crew_add_day_event(p_id text, p_kind text, p_at timestamptz, p_work_date date, p_doc_id text default '',
  p_lat double precision default null, p_lng double precision default null, p_not_at_site boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if p_kind not in ('start_job', 'start_transit', 'arrive', 'end_shift') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
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

-- A worker's fix-my-time request (the owner approves or denies it; history is kept).
create or replace function public.crew_request_time_fix(p_id text, p_work_date date, p_kind text, p_at timestamptz, p_reason text,
  p_event_id text default null, p_doc_id text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is needed' using errcode = 'P0001'; end if;
  select j.owner_id, coalesce(j.employee_id, '') as employee_id into a from public.crew_jobs j
   where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email()
     and (coalesce(p_doc_id, '') = '' or j.doc_id = p_doc_id) order by j.job_date desc limit 1;
  if a.owner_id is null then raise exception 'not on a crew' using errcode = '42501'; end if;
  insert into public.crew_time_fixes (id, owner_id, employee_id, worker_email, work_date, event_id, kind, at, doc_id, reason)
  values (left(p_id, 80), a.owner_id, a.employee_id, public.crew_email(), p_work_date, p_event_id, p_kind, p_at, coalesce(p_doc_id, ''), left(p_reason, 300))
  on conflict (id) do nothing;
  return true;
end $$;

-- Owner: keep the EARLIEST pay cutover any device saved, and return it so every device uses the same day.
create or replace function public.crew_claim_pay_cutover(p_date date)
returns date language plpgsql security definer set search_path = public as $$
declare result date;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = 'P0001'; end if;
  insert into public.crew_timesheet_settings (owner_id, pay_cutover) values (auth.uid(), p_date)
  on conflict (owner_id) do update set pay_cutover = least(coalesce(crew_timesheet_settings.pay_cutover, excluded.pay_cutover), excluded.pay_cutover), updated_at = now()
  returning pay_cutover into result;
  return result;
end $$;
revoke all on function public.crew_claim_pay_cutover(date) from public, anon;
grant execute on function public.crew_claim_pay_cutover(date) to authenticated;

revoke all on function public.crew_add_day_event(text, text, timestamptz, date, text, double precision, double precision, boolean) from public, anon;
revoke all on function public.crew_request_time_fix(text, date, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.crew_add_day_event(text, text, timestamptz, date, text, double precision, double precision, boolean) to authenticated;
grant execute on function public.crew_request_time_fix(text, date, text, timestamptz, text, text, text) to authenticated;

-- Checks (each returns TRUE):
-- select count(*) = 4 as tables_exist from information_schema.tables where table_schema = 'public' and table_name in ('crew_day_events', 'crew_time_fixes', 'crew_day_approvals', 'crew_timesheet_settings');
-- select bool_and(relrowsecurity) as rls_on from pg_class where relname in ('crew_day_events', 'crew_time_fixes', 'crew_day_approvals', 'crew_timesheet_settings');
-- select count(*) = 6 as policies_exist from pg_policies where schemaname = 'public' and tablename in ('crew_day_events', 'crew_time_fixes', 'crew_day_approvals', 'crew_timesheet_settings');
-- select to_regprocedure('public.crew_add_day_event(text,text,timestamptz,date,text,double precision,double precision,boolean)') is not null and to_regprocedure('public.crew_request_time_fix(text,date,text,timestamptz,text,text,text)') is not null as functions_exist;
-- select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('crew_day_events', 'crew_time_fixes') and column_name ~ '(rate|pay|price|amount)') as no_price_columns_for_workers;
-- select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crew_timesheet_settings' and column_name = 'pay_cutover' and data_type = 'date') and to_regprocedure('public.crew_claim_pay_cutover(date)') is not null as pay_cutover_ready;
-- select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crew_day_approvals' and column_name = 'changed_at') as approval_changed_at_ready;
