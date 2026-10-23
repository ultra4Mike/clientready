-- Time tracking phase 2: crew leads (team clock in/out with acted_by), PTO / sick requests and balances.
-- Idempotent: safe to run more than once. No price, rate or pay columns are visible to workers or leads.

-- 1) Who made a tap: '' = the worker himself; otherwise the crew lead's email (shown in the audit log).
alter table public.crew_day_events add column if not exists acted_by text not null default '';

create or replace function public.crew_time_audit_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'crew_day_events' then
    if tg_op = 'INSERT' then
      insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
      values (new.owner_id, coalesce(nullif(new.acted_by, ''), new.worker_email, ''), new.employee_id, new.work_date, 'tap', null,
        jsonb_build_object('kind', new.kind, 'at', new.at, 'device_at', new.device_at, 'doc_id', new.doc_id, 'not_at_site', new.not_at_site, 'out_of_order', new.out_of_order, 'offline', new.offline, 'acted_by', nullif(new.acted_by, '')));
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
  elsif tg_table_name = 'crew_pto_requests' then
    insert into public.crew_time_audit (owner_id, actor_email, employee_id, work_date, action, old_value, new_value)
    values (new.owner_id, case when tg_op = 'INSERT' then new.worker_email else coalesce(auth.jwt() ->> 'email', '') end, new.employee_id, new.work_date,
      case when tg_op = 'INSERT' then 'pto_request' else 'pto_' || new.status end,
      case when tg_op = 'UPDATE' then jsonb_build_object('status', old.status) else null end,
      jsonb_build_object('kind', new.kind, 'hours', new.hours, 'status', new.status));
  end if;
  return coalesce(new, old);
end $$;

-- 2) The signed-in worker's lead record (owner sets it on Team: time_overrides.lead / crewIds / leadPerms).
create or replace function public.crew_lead_self()
returns table (owner_id uuid, employee_id text, crew_ids text[], see_hours boolean, clock_team boolean)
language sql stable security definer set search_path = public as $$
  with o as (select j.owner_id, j.employee_id from public.crew_jobs j where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1)
  select o.owner_id, o.employee_id,
    coalesce(array(select jsonb_array_elements_text(coalesce(e.time_overrides->'crewIds', '[]'::jsonb))), '{}'),
    coalesce((e.time_overrides->'leadPerms'->>'seeHours')::boolean, true),
    coalesce((e.time_overrides->'leadPerms'->>'clockTeam')::boolean, true)
  from o join public.employees e on e.user_id = o.owner_id and e.id = o.employee_id
  where coalesce((e.time_overrides->>'lead')::boolean, false) or lower(coalesce(e.role, '')) = 'lead'
$$;

-- The lead's crew: ids and names only.
create or replace function public.crew_lead_team()
returns table (employee_id text, name text)
language sql stable security definer set search_path = public as $$
  select e.id, e.name from public.crew_lead_self() l join public.employees e on e.user_id = l.owner_id
   where e.id = any(l.crew_ids) and e.id <> l.employee_id and coalesce(e.active, true)
$$;

-- The crew's taps for a date range (when the owner lets the lead see hours). No pay fields.
create or replace function public.crew_lead_events(p_from date, p_to date)
returns table (id text, employee_id text, work_date date, kind text, at timestamptz, doc_id text, acted_by text)
language sql stable security definer set search_path = public as $$
  select d.id, d.employee_id, d.work_date, d.kind, d.at, d.doc_id, d.acted_by
    from public.crew_lead_self() l join public.crew_day_events d on d.owner_id = l.owner_id
   where l.see_hours and d.employee_id = any(l.crew_ids) and d.work_date between p_from and least(p_to, p_from + 62)
$$;

-- Clock a crew member in or out (start_day / end_day / break) for him; acted_by = the lead.
create or replace function public.crew_lead_tap(p_id text, p_employee_id text, p_kind text, p_at timestamptz, p_work_date date)
returns boolean language plpgsql security definer set search_path = public as $$
declare l record; w record;
begin
  if p_kind not in ('start_day', 'end_day', 'break_start', 'break_end') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
  if abs(extract(epoch from (p_at - now()))) > 86400 then raise exception 'time is not valid' using errcode = 'P0001'; end if;
  select * into l from public.crew_lead_self() limit 1;
  if l.owner_id is null or not l.clock_team or not (p_employee_id = any(l.crew_ids)) then raise exception 'not your crew' using errcode = '42501'; end if;
  select e.id, lower(coalesce(e.email, '')) as email into w from public.employees e where e.user_id = l.owner_id and e.id = p_employee_id and coalesce(e.active, true);
  if w.id is null or w.email = '' then raise exception 'worker has no email' using errcode = 'P0001'; end if;
  insert into public.crew_day_events (id, owner_id, employee_id, worker_email, work_date, kind, at, doc_id, acted_by)
  values (left(p_id, 80), l.owner_id, w.id, w.email, p_work_date, p_kind, p_at, '', public.crew_email())
  on conflict (id) do nothing;
  return true;
end $$;

-- 3) PTO / sick requests: the worker asks, the owner approves or denies.
create table if not exists public.crew_pto_requests (
  id text primary key,
  owner_id uuid not null,
  employee_id text not null default '',
  worker_email text not null default '',
  work_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  kind text not null default 'pto' check (kind in ('pto', 'sick')),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists crew_pto_requests_owner_idx on public.crew_pto_requests (owner_id, work_date);
alter table public.crew_pto_requests enable row level security;
drop policy if exists crew_pto_requests_owner_all on public.crew_pto_requests;
drop policy if exists crew_pto_requests_worker_read on public.crew_pto_requests;
create policy crew_pto_requests_owner_all on public.crew_pto_requests for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_pto_requests_worker_read on public.crew_pto_requests for select to authenticated using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
revoke all on public.crew_pto_requests from anon;
grant select, insert, update, delete on public.crew_pto_requests to authenticated;
drop trigger if exists crew_pto_requests_audit on public.crew_pto_requests;
create trigger crew_pto_requests_audit after insert or update on public.crew_pto_requests for each row execute function public.crew_time_audit_events();

create or replace function public.crew_request_pto(p_id text, p_work_date date, p_hours numeric, p_kind text, p_note text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare a record; b numeric;
begin
  if p_kind not in ('pto', 'sick') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then raise exception 'hours must be between 0 and 24' using errcode = 'P0001'; end if;
  select j.owner_id, coalesce(j.employee_id, '') as employee_id into a from public.crew_jobs j
   where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1;
  if a.owner_id is null then raise exception 'not on a crew' using errcode = '42501'; end if;
  select available into b from public.crew_pto_balances where owner_id = a.owner_id and employee_id = a.employee_id and year = extract(year from p_work_date)::int;
  if b is not null and p_hours > b then raise exception 'not enough hours available' using errcode = 'P0001'; end if;
  insert into public.crew_pto_requests (id, owner_id, employee_id, worker_email, work_date, hours, kind, note)
  values (left(p_id, 80), a.owner_id, a.employee_id, public.crew_email(), p_work_date, p_hours, p_kind, left(coalesce(p_note, ''), 300))
  on conflict (id) do nothing;
  return true;
end $$;

-- 4) Balances the owner's app computes (hours only, no money); the worker reads his own.
create table if not exists public.crew_pto_balances (
  owner_id uuid not null,
  employee_id text not null,
  year int not null,
  accrued numeric(7,2) not null default 0,
  taken numeric(7,2) not null default 0,
  available numeric(7,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, employee_id, year)
);
alter table public.crew_pto_balances enable row level security;
drop policy if exists crew_pto_balances_owner_all on public.crew_pto_balances;
create policy crew_pto_balances_owner_all on public.crew_pto_balances for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.crew_pto_balances from anon;
grant select, insert, update, delete on public.crew_pto_balances to authenticated;

create or replace function public.crew_pto_balance(p_year int)
returns table (accrued numeric, taken numeric, available numeric, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with o as (select j.owner_id, j.employee_id from public.crew_jobs j where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1)
  select b.accrued, b.taken, b.available, b.updated_at from o join public.crew_pto_balances b on b.owner_id = o.owner_id and b.employee_id = o.employee_id and b.year = p_year
$$;

revoke all on function public.crew_lead_self() from public, anon;
revoke all on function public.crew_lead_team() from public, anon;
revoke all on function public.crew_lead_events(date, date) from public, anon;
revoke all on function public.crew_lead_tap(text, text, text, timestamptz, date) from public, anon;
revoke all on function public.crew_request_pto(text, date, numeric, text, text) from public, anon;
revoke all on function public.crew_pto_balance(int) from public, anon;
grant execute on function public.crew_lead_self() to authenticated;
grant execute on function public.crew_lead_team() to authenticated;
grant execute on function public.crew_lead_events(date, date) to authenticated;
grant execute on function public.crew_lead_tap(text, text, text, timestamptz, date) to authenticated;
grant execute on function public.crew_request_pto(text, date, numeric, text, text) to authenticated;
grant execute on function public.crew_pto_balance(int) to authenticated;

-- Fix release (live crew test): one time zone and one paid-hours number for owner and crew.
-- crew_time_zone(): the account's profiles.timezone (valid IANA name) or America/Chicago, so the phone shows times in
-- the business zone, not the phone's zone.
create or replace function public.crew_time_zone()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select p.timezone from public.crew_jobs j join public.profiles p on p.id = j.owner_id
     where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email()
       and exists (select 1 from pg_timezone_names z where z.name = p.timezone)
     order by j.job_date desc limit 1), 'America/Chicago')
$$;
revoke all on function public.crew_time_zone() from public, anon;
grant execute on function public.crew_time_zone() to authenticated;

-- crew_my_day_status(from, to): this worker's own days as the owner decided them (minutes only, never pay):
-- minutes = edited minutes, else the approved minutes when approved, else null (the phone shows its own estimate).
create or replace function public.crew_my_day_status(p_from date, p_to date)
returns table (work_date date, minutes numeric, approved boolean, changed boolean)
language sql stable security definer set search_path = public as $$
  with me as (select distinct j.owner_id, j.employee_id from public.crew_jobs j
     where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() and coalesce(j.employee_id, '') <> '')
  select a.work_date, case when a.edited_minutes is not null then a.edited_minutes when a.approved_at is not null then a.paid_minutes end,
    a.approved_at is not null, a.changed_at is not null and a.approved_at is null
  from public.crew_day_approvals a join me on me.owner_id = a.owner_id and me.employee_id = a.employee_id
  where a.work_date between p_from and least(p_to, p_from + 62)
$$;
revoke all on function public.crew_my_day_status(date, date) from public, anon;
grant execute on function public.crew_my_day_status(date, date) to authenticated;
