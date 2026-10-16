-- Job-complete checklist. The owner keeps it in documents.data.schedule.checklist; assigned crew see a
-- copy in crew_jobs.checklist and tick items through crew_check_item(). Add-only and re-runnable.
alter table public.crew_jobs add column if not exists checklist jsonb not null default '[]'::jsonb;

create or replace function public.crew_check_item(p_doc_id text, p_item_id text, p_done boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.crew_email();
  v_owner uuid;
  v_name text;
  v_list jsonb;
  v_next jsonb;
  v_stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or v_email = '' then return false; end if;
  select owner_id, worker_name into v_owner, v_name from public.crew_jobs
   where doc_id = p_doc_id and id like p_doc_id || '-sched-%' and lower(worker_email) = v_email
   limit 1;
  if v_owner is null then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  select coalesce(data -> 'schedule' -> 'checklist', '[]'::jsonb) into v_list from public.documents
   where id::text = p_doc_id and user_id = v_owner and coalesce(data -> 'schedule' ->> 'confirmedAt', '') = ''
   for update;
  if v_list is null then return false; end if; -- no such job, or the owner already confirmed it
  if not exists (select 1 from jsonb_array_elements(v_list) e where e ->> 'id' = p_item_id) then return false; end if;
  select coalesce(jsonb_agg(case when e ->> 'id' = p_item_id then
           case when p_done then (e - 'done' - 'doneBy' - 'doneAt') || jsonb_build_object('done', true, 'doneBy', coalesce(v_name, ''), 'doneAt', v_stamp)
                else e - 'done' - 'doneBy' - 'doneAt' end
         else e end order by n), '[]'::jsonb)
    into v_next
    from jsonb_array_elements(v_list) with ordinality as t(e, n);
  update public.documents
     set data = jsonb_set(data, '{schedule}', (data -> 'schedule') || jsonb_build_object('checklist', v_next, 'updatedAt', v_stamp))
   where id::text = p_doc_id and user_id = v_owner;
  update public.crew_jobs set checklist = v_next where doc_id = p_doc_id and id like p_doc_id || '-sched-%';
  return true;
end;
$$;
revoke all on function public.crew_check_item(text, text, boolean) from public, anon;
grant execute on function public.crew_check_item(text, text, boolean) to authenticated;
