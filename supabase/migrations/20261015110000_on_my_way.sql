-- "On my way": an assigned crew member taps it before driving to a job. Safe to re-run.
-- Run after 20261015100000_document_tombstones.sql.
-- Writes only schedule.onMyWayAt / onMyWayBy (+ updatedAt) on the document and crew_jobs.on_my_way_at.
-- No prices, totals, costs or other workers' data are read or returned. Nothing is sent to the customer.
alter table public.crew_jobs add column if not exists on_my_way_at text not null default '';

create or replace function public.crew_on_my_way(p_doc_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_owner uuid;
  v_name text;
  v_stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or v_email = '' then return false; end if;
  select owner_id, coalesce(nullif(worker_name, ''), 'Crew') into v_owner, v_name from public.crew_jobs
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%' and lower(worker_email) = v_email
   limit 1;
  if v_owner is null then return false; end if;
  update public.documents
     set data = jsonb_set(data, '{schedule}',
           (data -> 'schedule') || jsonb_build_object('onMyWayAt', v_stamp, 'onMyWayBy', v_name, 'updatedAt', v_stamp))
   where id::text = p_doc_id and user_id = v_owner and data ? 'schedule'
     and coalesce(data -> 'schedule' ->> 'status', 'scheduled') <> 'done';
  if not found then return false; end if;
  update public.crew_jobs set on_my_way_at = v_stamp
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%';
  return true;
end;
$$;
revoke all on function public.crew_on_my_way(text) from public, anon;
grant execute on function public.crew_on_my_way(text) to authenticated;
