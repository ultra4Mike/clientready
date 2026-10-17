-- Offline clock in/out (add-only, re-runnable). The phone may send the time it was tapped (p_at) plus an
-- idempotency key; the server accepts a time up to 24 hours old and at most 5 minutes in the future
-- (future times are capped at now()). Entries using a phone time are flagged for the owner.
-- The original one-argument functions are left unchanged.
alter table public.crew_clock add column if not exists in_key text not null default '';
alter table public.crew_clock add column if not exists out_key text not null default '';
alter table public.crew_clock add column if not exists phone_time boolean not null default false;
create unique index if not exists crew_clock_in_key_uniq on public.crew_clock (lower(worker_email), in_key) where in_key <> '';
create unique index if not exists crew_clock_out_key_uniq on public.crew_clock (lower(worker_email), out_key) where out_key <> '';

create or replace function public.crew_clock_time(p_at timestamptz)
returns timestamptz language plpgsql stable set search_path = public as $$
begin
  if p_at is null then return now(); end if;
  if p_at < now() - interval '24 hours' or p_at > now() + interval '5 minutes' then
    raise exception 'clock time too far off; use Fix time with a reason' using errcode = '22023';
  end if;
  return least(p_at, now());
end;
$$;

create or replace function public.crew_clock_in(p_doc_id text, p_at timestamptz, p_client_key text)
returns public.crew_clock language plpgsql volatile security definer set search_path = public as $$
declare
  a record;
  t timestamptz;
  result public.crew_clock;
begin
  if coalesce(p_client_key, '') <> '' then
    select * into result from public.crew_clock where lower(worker_email) = public.crew_email() and in_key = p_client_key;
    if result.id is not null then return result; end if;
  end if;
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  t := public.crew_clock_time(p_at);
  if exists (select 1 from public.crew_clock where lower(worker_email) = public.crew_email() and ended_at is null) then
    raise exception 'already clocked in' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crew_clock where lower(worker_email) = public.crew_email() and ended_at > t) then
    raise exception 'clock time overlaps an earlier entry' using errcode = '22023';
  end if;
  insert into public.crew_clock (owner_id, doc_id, employee_id, worker_email, worker_name, started_at, in_key, phone_time)
  values (a.owner_id, p_doc_id, a.employee_id, public.crew_email(), a.worker_name, t, coalesce(p_client_key, ''), p_at is not null and t < now() - interval '1 minute')
  returning * into result;
  return result;
end;
$$;

create or replace function public.crew_clock_out(p_doc_id text, p_at timestamptz, p_client_key text)
returns public.crew_clock language plpgsql volatile security definer set search_path = public as $$
declare
  t timestamptz;
  result public.crew_clock;
begin
  if coalesce(p_client_key, '') <> '' then
    select * into result from public.crew_clock where lower(worker_email) = public.crew_email() and out_key = p_client_key;
    if result.id is not null then return result; end if;
  end if;
  t := public.crew_clock_time(p_at);
  update public.crew_clock
     set ended_at = greatest(t, started_at + interval '1 second'),
         out_key = coalesce(p_client_key, ''),
         phone_time = phone_time or (p_at is not null and t < now() - interval '1 minute')
   where doc_id = p_doc_id and lower(worker_email) = public.crew_email() and ended_at is null
  returning * into result;
  if result.id is null then
    raise exception 'not clocked in on this job' using errcode = 'P0001';
  end if;
  return result;
end;
$$;

revoke all on function public.crew_clock_time(timestamptz) from public, anon;
revoke all on function public.crew_clock_in(text, timestamptz, text) from public, anon;
revoke all on function public.crew_clock_out(text, timestamptz, text) from public, anon;
grant execute on function public.crew_clock_time(timestamptz) to authenticated;
grant execute on function public.crew_clock_in(text, timestamptz, text) to authenticated;
grant execute on function public.crew_clock_out(text, timestamptz, text) to authenticated;
