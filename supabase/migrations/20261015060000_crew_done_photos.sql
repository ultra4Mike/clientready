-- Crew marks a job done with at least one photo; the owner then confirms it. Safe to re-run.
-- Run after 20261015020000_crew_isolation_clock.sql (uses crew_assignment / crew_email).
--
-- Until the owner confirms, the job is "done - awaiting confirmation":
--   documents.data.schedule: status 'done', doneAt, doneBy (worker name); confirmedAt is set by the owner.
--   crew_jobs.done_confirmed mirrors the owner's confirmation so the crew app can show it.

create table if not exists public.crew_job_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  doc_id text not null,
  worker_email text not null default '',
  worker_name text not null default '',
  photo text not null,
  created_at timestamptz not null default now()
);
create index if not exists crew_job_photos_owner_doc_idx on public.crew_job_photos (owner_id, doc_id);

alter table public.crew_job_photos enable row level security;
drop policy if exists crew_job_photos_owner on public.crew_job_photos;
drop policy if exists crew_job_photos_worker_read on public.crew_job_photos;
create policy crew_job_photos_owner on public.crew_job_photos for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_job_photos_worker_read on public.crew_job_photos for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
revoke all on public.crew_job_photos from anon;
grant select, insert, update, delete on public.crew_job_photos to authenticated;

alter table public.crew_jobs add column if not exists done_confirmed boolean not null default false;

-- Crew: mark an assigned job done. Requires 1-6 photos (compressed JPEG data URLs, each <= 700 KB).
-- Changes only documents.data.schedule (status/doneAt/doneBy/updatedAt, clears confirmedAt) and
-- crew_jobs.schedule_status/done_confirmed for the job's schedule rows. Never money or status fields.
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
  if v_count < 1 then
    raise exception 'add at least one photo of the finished job' using errcode = 'P0001';
  end if;
  if v_count > 6 then
    raise exception 'up to 6 photos' using errcode = 'P0001';
  end if;
  foreach v_photo in array p_photos loop
    if v_photo is null or v_photo not like 'data:image/jpeg;base64,%' or length(v_photo) > 700000 then
      raise exception 'photo is not valid' using errcode = 'P0001';
    end if;
  end loop;
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
  insert into public.crew_job_photos (owner_id, doc_id, worker_email, worker_name, photo)
  select a.owner_id, p_doc_id, public.crew_email(), coalesce(a.worker_name, ''), unnest(p_photos);
  update public.crew_jobs set schedule_status = 'done', done_confirmed = false
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%';
  return true;
end;
$$;
revoke all on function public.crew_mark_done(text, text[]) from public, anon;
grant execute on function public.crew_mark_done(text, text[]) to authenticated;

-- Status changes other than "done" (done needs photos, see crew_mark_done). Refused once the
-- owner has confirmed the job. Moving off "done" clears the done stamp.
create or replace function public.crew_set_job_status(p_doc_id text, p_status text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_owner uuid;
  v_stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or v_email = '' or p_status not in ('scheduled', 'in_progress') then
    return false;
  end if;
  select owner_id into v_owner from public.crew_jobs
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%' and lower(worker_email) = v_email
   limit 1;
  if v_owner is null then return false; end if;
  update public.documents
     set data = jsonb_set(data, '{schedule}',
           ((data -> 'schedule') - 'doneAt' - 'doneBy')
           || jsonb_build_object('status', p_status, 'updatedAt', v_stamp))
   where id::text = p_doc_id and user_id = v_owner and data ? 'schedule'
     and coalesce(data -> 'schedule' ->> 'confirmedAt', '') = '';
  if not found then return false; end if;
  update public.crew_jobs set schedule_status = p_status, done_confirmed = false
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%';
  return true;
end;
$$;
revoke all on function public.crew_set_job_status(text, text) from public, anon;
grant execute on function public.crew_set_job_status(text, text) to authenticated;
