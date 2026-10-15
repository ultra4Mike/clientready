-- Job scheduling: crew can see their scheduled jobs and update only the job status.

-- Schedule rows in crew_jobs ("<doc id>-sched-<employee id>") carry the client's email and the
-- schedule status (scheduled / in_progress / done) alongside the existing columns.
alter table public.crew_jobs add column if not exists client_email text default '';
alter table public.crew_jobs add column if not exists schedule_status text default '';

-- A signed-in crew member sets the status of a job they are assigned to. Only
-- documents.data.schedule.status/updatedAt and crew_jobs.schedule_status change; nothing else.
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
  if auth.uid() is null or v_email = '' or p_status not in ('scheduled', 'in_progress', 'done') then
    return false;
  end if;
  select owner_id into v_owner from public.crew_jobs
   where doc_id = p_doc_id
     and id like p_doc_id || '-sched-%'
     and lower(worker_email) = v_email
   limit 1;
  if v_owner is null then
    return false;
  end if;
  update public.documents
     set data = jsonb_set(jsonb_set(data, '{schedule,status}', to_jsonb(p_status)), '{schedule,updatedAt}', to_jsonb(v_stamp))
   where id::text = p_doc_id
     and user_id = v_owner
     and data ? 'schedule';
  if not found then
    return false;
  end if;
  update public.crew_jobs set schedule_status = p_status
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%';
  return true;
end;
$$;

revoke all on function public.crew_set_job_status(text, text) from public;
revoke all on function public.crew_set_job_status(text, text) from anon;
grant execute on function public.crew_set_job_status(text, text) to authenticated;

-- The customer approval page must not show the crew schedule: same function as before, minus 'schedule'.
create or replace function public.get_document_by_approval_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.documents%rowtype;
  p public.profiles%rowtype;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select * into d from public.documents
   where data -> 'approval' ->> 'token' = p_token
   limit 1;
  if not found then
    return null;
  end if;
  select * into p from public.profiles where id = d.user_id;
  return jsonb_build_object(
    'type', d.type,
    'title', d.title,
    'clientName', d.client_name,
    'data', (d.data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                    - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime')
            || jsonb_build_object(
                 'approval', (d.data -> 'approval') - 'token',
                 'changeOrderOf', case when d.data ? 'changeOrderOf'
                                   then jsonb_build_object('number', d.data -> 'changeOrderOf' -> 'number')
                                   else null end),
    'business', jsonb_build_object(
      'name', coalesce(p.business_name, ''),
      'logo', coalesce(p.logo, ''),
      'paymentLink', coalesce(p.payment_link, ''),
      'email', coalesce(p.email, ''),
      'phone', coalesce(p.phone, ''))
  );
end;
$$;
