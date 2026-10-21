-- R125: crew add a job photo from the job card any time (not only when marking done). Safe to re-run.
-- Run after 20261024140000_trial_exempt.sql.
-- Adds one row to crew_job_photos (what the owner's Job photos already shows/counts). Changes nothing
-- else: no schedule, status, times, invoice or crew row. Assigned crew only; up to 30 photos per
-- worker per job; JPEG data URL up to ~500 KB; a retry with the same client key adds nothing.
create or replace function public.crew_add_job_photo(p_doc_id text, p_photo text, p_client_key text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_key text := left(coalesce(p_client_key, ''), 80);
begin
  if auth.uid() is null or public.crew_email() = '' then return false; end if;
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null or not exists (
    select 1 from public.crew_jobs where doc_id = p_doc_id and left(id, length(p_doc_id) + 7) = p_doc_id || '-sched-' and lower(worker_email) = public.crew_email()) then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  if p_photo is null or p_photo not like 'data:image/jpeg;base64,%' or length(p_photo) > 700000 then
    raise exception 'photo is not valid' using errcode = 'P0001';
  end if;
  if v_key <> '' and exists (select 1 from public.crew_job_photos where client_key = v_key || ':p' and doc_id = p_doc_id) then
    return true;
  end if;
  if (select count(*) from public.crew_job_photos where doc_id = p_doc_id and lower(worker_email) = public.crew_email()) >= 30 then
    raise exception 'up to 30 photos per job' using errcode = 'P0001';
  end if;
  insert into public.crew_job_photos (owner_id, doc_id, worker_email, worker_name, photo, client_key)
  values (a.owner_id, p_doc_id, public.crew_email(), coalesce(a.worker_name, ''), p_photo, nullif(v_key, '') || ':p');
  return true;
exception when unique_violation then
  return true;
end;
$$;
revoke all on function public.crew_add_job_photo(text, text, text) from public, anon;
grant execute on function public.crew_add_job_photo(text, text, text) to authenticated;
-- Check: select to_regprocedure('public.crew_add_job_photo(text,text,text)') is not null;
