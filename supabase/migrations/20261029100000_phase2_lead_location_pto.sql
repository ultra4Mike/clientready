-- Phase 2 milestone 2: the crew lead's taps record the lead's location; PTO requests honour "allow a negative balance".
-- Idempotent: safe to run more than once. Nothing here exposes prices or pay to workers or leads.

-- 1) Lead tap with the lead's phone location (lat/lng may be null when the lead denies location).
create or replace function public.crew_lead_tap(p_id text, p_employee_id text, p_kind text, p_at timestamptz, p_work_date date,
  p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = public as $$
declare l record; w record;
begin
  if p_kind not in ('start_day', 'end_day', 'break_start', 'break_end') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
  if abs(extract(epoch from (p_at - now()))) > 86400 then raise exception 'time is not valid' using errcode = 'P0001'; end if;
  if (p_lat is not null and (p_lat < -90 or p_lat > 90)) or (p_lng is not null and (p_lng < -180 or p_lng > 180)) then raise exception 'location is not valid' using errcode = 'P0001'; end if;
  select * into l from public.crew_lead_self() limit 1;
  if l.owner_id is null or not l.clock_team or not (p_employee_id = any(l.crew_ids)) then raise exception 'not your crew' using errcode = '42501'; end if;
  select e.id, lower(coalesce(e.email, '')) as email into w from public.employees e where e.user_id = l.owner_id and e.id = p_employee_id and coalesce(e.active, true);
  if w.id is null or w.email = '' then raise exception 'worker has no email' using errcode = 'P0001'; end if;
  insert into public.crew_day_events (id, owner_id, employee_id, worker_email, work_date, kind, at, doc_id, acted_by, lat, lng)
  values (left(p_id, 80), l.owner_id, w.id, w.email, p_work_date, p_kind, p_at, '', public.crew_email(), p_lat, p_lng)
  on conflict (id) do nothing;
  return true;
end $$;
revoke all on function public.crew_lead_tap(text, text, text, timestamptz, date, double precision, double precision) from public, anon;
grant execute on function public.crew_lead_tap(text, text, text, timestamptz, date, double precision, double precision) to authenticated;

-- 2) PTO request: refused when the account has PTO off and no balance; over-balance only when the owner allows negative.
create or replace function public.crew_request_pto(p_id text, p_work_date date, p_hours numeric, p_kind text, p_note text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare a record; b numeric; pend numeric; r jsonb;
begin
  if p_kind not in ('pto', 'sick') then raise exception 'kind is not valid' using errcode = 'P0001'; end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then raise exception 'hours must be between 0 and 24' using errcode = 'P0001'; end if;
  select j.owner_id, coalesce(j.employee_id, '') as employee_id into a from public.crew_jobs j
   where public.crew_email() <> '' and lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1;
  if a.owner_id is null then raise exception 'not on a crew' using errcode = '42501'; end if;
  select coalesce(s.rules, '{}'::jsonb) into r from public.crew_timesheet_settings s where s.owner_id = a.owner_id;
  r := coalesce(r, '{}'::jsonb);
  select available into b from public.crew_pto_balances where owner_id = a.owner_id and employee_id = a.employee_id and year = extract(year from p_work_date)::int;
  if b is null and coalesce(r->>'ptoPreset', 'off') in ('off', 'federal') then raise exception 'time-off requests are off' using errcode = 'P0001'; end if;
  if coalesce((r->>'ptoAllowNegative')::boolean, false) is not true then
    select coalesce(sum(hours), 0) into pend from public.crew_pto_requests where owner_id = a.owner_id and employee_id = a.employee_id and status = 'pending'
      and extract(year from work_date) = extract(year from p_work_date) and id <> left(p_id, 80);
    if p_hours + pend > coalesce(b, 0) then raise exception 'not enough hours available' using errcode = 'P0001'; end if;
  end if;
  insert into public.crew_pto_requests (id, owner_id, employee_id, worker_email, work_date, hours, kind, note)
  values (left(p_id, 80), a.owner_id, a.employee_id, public.crew_email(), p_work_date, p_hours, p_kind, left(coalesce(p_note, ''), 300))
  on conflict (id) do nothing;
  return true;
end $$;
revoke all on function public.crew_request_pto(text, date, numeric, text, text) from public, anon;
grant execute on function public.crew_request_pto(text, date, numeric, text, text) to authenticated;

-- Check queries (each should return true):
-- select to_regprocedure('public.crew_lead_tap(text,text,text,timestamptz,date,double precision,double precision)') is not null as lead_location_ready;
-- select pg_get_functiondef('public.crew_request_pto(text,date,numeric,text,text)'::regprocedure) like '%ptoAllowNegative%' as pto_negative_ready;
