-- QA3b crew app: job title + scope (names only, never prices), optional finished-job photo (owner setting,
-- default = required as before), and unpaid time-off requests (crew asks, owner approves/denies). No pay changes.

-- 1) Job title and line descriptions on the crew's job rows (written by the owner app; text only).
alter table public.crew_jobs add column if not exists job_title text not null default '';
alter table public.crew_jobs add column if not exists line_names text[] not null default '{}'::text[];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crew_jobs_line_names_size') then
    alter table public.crew_jobs add constraint crew_jobs_line_names_size
      check (length(job_title) <= 200 and cardinality(line_names) <= 30 and octet_length(array_to_string(line_names, '|')) <= 6000);
  end if;
end $$;

-- 2) Owner setting: finished-job photo optional (default false = photo required, today's behaviour).
alter table public.profiles add column if not exists done_photo_optional boolean not null default false;

create or replace function public.crew_done_photo_optional(p_doc_id text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if auth.uid() is null or public.crew_email() = '' then return false; end if;
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null then return false; end if;
  return coalesce((select done_photo_optional from public.profiles where id = a.owner_id), false);
end $$;
revoke all on function public.crew_done_photo_optional(text) from public, anon;
grant execute on function public.crew_done_photo_optional(text) to authenticated;

-- Same as 20261015060000, except "at least one photo" only applies when the owner keeps photos required.
create or replace function public.crew_mark_done(p_doc_id text, p_photos text[])
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a record;
  v_photo text;
  v_count int := coalesce(array_length(p_photos, 1), 0);
  v_stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or public.crew_email() = '' then return false; end if;
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null or not exists (
    select 1 from public.crew_jobs where doc_id = p_doc_id and id like p_doc_id || '-sched-%' and lower(worker_email) = public.crew_email()) then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  if v_count < 1 and not coalesce((select done_photo_optional from public.profiles where id = a.owner_id), false) then
    raise exception 'add at least one photo of the finished job' using errcode = 'P0001';
  end if;
  if v_count > 6 then
    raise exception 'up to 6 photos' using errcode = 'P0001';
  end if;
  if v_count > 0 then
    foreach v_photo in array p_photos loop
      if v_photo is null or v_photo not like 'data:image/jpeg;base64,%' or length(v_photo) > 700000 then
        raise exception 'photo is not valid' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  if exists (select 1 from public.documents where id::text = p_doc_id and user_id = a.owner_id
             and coalesce(data -> 'schedule' ->> 'confirmedAt', '') <> '') then
    raise exception 'the owner already confirmed this job' using errcode = 'P0001';
  end if;
  update public.documents
     set data = jsonb_set(data, '{schedule}',
           ((data -> 'schedule') - 'confirmedAt' - 'confirmedBy')
           || jsonb_build_object('status', 'done', 'doneAt', v_stamp, 'doneBy', coalesce(a.worker_name, ''), 'updatedAt', v_stamp))
   where id::text = p_doc_id and user_id = a.owner_id and data ? 'schedule';
  if not found then return false; end if;
  if v_count > 0 then
    insert into public.crew_job_photos (owner_id, doc_id, worker_email, worker_name, photo)
    select a.owner_id, p_doc_id, public.crew_email(), coalesce(a.worker_name, ''), unnest(p_photos);
  end if;
  update public.crew_jobs set schedule_status = 'done', done_confirmed = false
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%';
  return true;
end;
$$;
revoke all on function public.crew_mark_done(text, text[]) from public, anon;
grant execute on function public.crew_mark_done(text, text[]) to authenticated;

-- 3) Unpaid time off. Crew use the two functions below (no direct table access); the owner reads/decides own rows.
create table if not exists public.crew_time_off (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  employee_id text not null default '',
  worker_email text not null,
  worker_name text not null default '',
  start_date date not null,
  end_date date not null,
  note text not null default '' check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (end_date >= start_date and end_date - start_date <= 60)
);
create index if not exists crew_time_off_owner on public.crew_time_off (owner_id, created_at desc);
alter table public.crew_time_off enable row level security;
drop policy if exists crew_time_off_owner_select on public.crew_time_off;
create policy crew_time_off_owner_select on public.crew_time_off for select to authenticated using (owner_id = auth.uid());
drop policy if exists crew_time_off_owner_update on public.crew_time_off;
create policy crew_time_off_owner_update on public.crew_time_off for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.crew_time_off from anon;
grant select, update (status, decided_at) on public.crew_time_off to authenticated;

create or replace function public.crew_request_time_off(p_start date, p_end date, p_note text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_owner uuid; v_emp text; v_name text; v_id uuid; v_end date := coalesce(p_end, p_start);
begin
  if auth.uid() is null or public.crew_email() = '' then raise exception 'sign in first' using errcode = '42501'; end if;
  select e.user_id, e.id, coalesce(e.name, '') into v_owner, v_emp, v_name from public.employees e
   where lower(coalesce(e.email, '')) = public.crew_email() and coalesce(e.active, true) order by e.user_id limit 1;
  if v_owner is null then
    select j.owner_id, coalesce(j.employee_id, ''), coalesce(j.worker_name, '') into v_owner, v_emp, v_name from public.crew_jobs j
     where lower(j.worker_email) = public.crew_email() order by j.job_date desc limit 1;
  end if;
  if v_owner is null then raise exception 'you are not on a team yet' using errcode = '42501'; end if;
  if p_start is null or v_end < p_start then raise exception 'the last day can''t be before the first day' using errcode = 'P0001'; end if;
  if p_start < current_date - 1 then raise exception 'time off can''t start in the past' using errcode = 'P0001'; end if;
  if v_end - p_start > 60 then raise exception 'ask for 60 days or fewer at a time' using errcode = 'P0001'; end if;
  if (select count(*) from public.crew_time_off where worker_email = public.crew_email() and status = 'pending') >= 10 then
    raise exception 'too many requests waiting' using errcode = 'P0001';
  end if;
  insert into public.crew_time_off (owner_id, employee_id, worker_email, worker_name, start_date, end_date, note)
  values (v_owner, coalesce(v_emp, ''), public.crew_email(), coalesce(v_name, ''), p_start, v_end, left(btrim(coalesce(p_note, '')), 500))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.crew_request_time_off(date, date, text) from public, anon;
grant execute on function public.crew_request_time_off(date, date, text) to authenticated;

create or replace function public.crew_my_time_off()
returns table (id uuid, start_date date, end_date date, note text, status text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.start_date, t.end_date, t.note, t.status, t.created_at, t.decided_at
    from public.crew_time_off t
   where public.crew_email() <> '' and t.worker_email = public.crew_email()
   order by t.created_at desc limit 50
$$;
revoke all on function public.crew_my_time_off() from public, anon;
grant execute on function public.crew_my_time_off() to authenticated;
