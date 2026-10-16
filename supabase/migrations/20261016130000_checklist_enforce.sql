-- Server-side job-complete checklist: crew_mark_done refuses while any checklist item is unticked.
-- Same body as the current 2-arg crew_mark_done plus that one check; the keyed overload (20261016100000)
-- calls this one, so it is covered too. Jobs without a checklist behave exactly as before. Re-runnable.
CREATE OR REPLACE FUNCTION public.crew_mark_done(p_doc_id text, p_photos text[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if exists (select 1 from public.documents d,
                    jsonb_array_elements(case when jsonb_typeof(d.data -> 'schedule' -> 'checklist') = 'array' then d.data -> 'schedule' -> 'checklist' else '[]'::jsonb end) e
              where d.id::text = p_doc_id and d.user_id = a.owner_id and coalesce((e ->> 'done')::boolean, false) = false) then
    raise exception 'finish the checklist first' using errcode = 'P0001';
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
$function$;
