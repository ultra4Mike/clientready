-- deploy12: Settings > Time off. Server honours the account-wide 'Workers can ask for time off' switch (rules.ptoRequestsOn).
-- Only replaces crew_request_pto; no table or data changes. Recorded pay is untouched.
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
  if coalesce(r->>'ptoRequestsOn', 'true') = 'false' then raise exception 'time-off requests are off' using errcode = 'P0001'; end if;
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

