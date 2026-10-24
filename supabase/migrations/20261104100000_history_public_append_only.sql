-- deploy29.sql: client-safe document history in customer views + append-only history. Re-runnable.
-- Run in the Supabase SQL editor AFTER 20261021100000_public_data_more_private.sql and 20261021160000_automation_safety.sql.
-- The last SELECT returns one row per check; every result should be 'ok'.
begin;

-- 1) Sanitizers (owner-only fields never leave the database through customer RPCs).
create or replace function public.public_approval_data(p_approval jsonb)
returns jsonb language sql immutable as $$
  select case when p_approval is null or jsonb_typeof(p_approval) <> 'object' then null
    else (p_approval - 'token' - 'note' - 'markedBy' - 'approvedBy')
         -- owner-recorded approvals (method set) carry the owner's name in approverName
         - (case when coalesce(p_approval ->> 'method', '') <> '' then 'approverName' else '' end)
  end
$$;

create or replace function public.public_history_data(p_history jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', e ->> 'at', 'event', ev) order by ord), '[]'::jsonb)
    from (
      select e, ord, case e ->> 'action'
               when 'Approved by phone' then 'approved_by_phone'
               when 'Marked approved by owner' then 'approved_by_owner'
               when 'Approval undone by owner' then 'approval_undone'
             end as ev
        from jsonb_array_elements(case when jsonb_typeof(p_history) = 'array' then p_history else '[]'::jsonb end)
             with ordinality as t(e, ord)
       where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'at') = 'string'
    ) s
   where ev is not null
$$;
revoke all on function public.public_approval_data(jsonb) from public, anon, authenticated;
revoke all on function public.public_history_data(jsonb) from public, anon, authenticated;

-- 2) Portal data (get_client_portal / get_portal_document): same hidden keys as 20261021100000, plus
--    sanitized approval and history (the build_object keys override the raw ones).
create or replace function public.public_document_data(p_data jsonb)
returns jsonb language sql immutable as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos' - 'clientId' - 'emailLog'
                 - 'crewReport' - 'noLateFee' - 'visitNotes' - 'hoursApprovals' - 'jobMiles' - 'reviewAskedAt'
                 - 'history' - 'crewKindFix' - 'crewUndo' - 'stockUsed' - 'autoSent')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then public.public_approval_data(p_data -> 'approval') else null end,
              'history', public.public_history_data(p_data -> 'history'),
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;

-- 3) Approval-link page (get_document_by_approval_token lists keys inline and was patched in place by
--    earlier migrations): patch the live definition the same way. Raises if the expected text isn't there.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.get_document_by_approval_token(text)'::regprocedure);
  if position('public_history_data' in def) = 0 then
    if position($k$'approval', (d.data -> 'approval') - 'token'$k$ in def) = 0 then
      raise exception 'get_document_by_approval_token: approval expression not found; patch by hand';
    end if;
    def := replace(def, $k$'approval', (d.data -> 'approval') - 'token'$k$,
      $k$'approval', public.public_approval_data(d.data -> 'approval'), 'history', public.public_history_data(d.data -> 'history')$k$);
    if position($k$- 'reviewAskedAt'$k$ in def) > 0 then
      def := replace(def, $k$- 'reviewAskedAt'$k$, $k$- 'reviewAskedAt' - 'crewKindFix' - 'crewUndo' - 'stockUsed' - 'autoSent'$k$);
    end if;
    execute def;
  end if;
end $$;

-- 4) Append-only history: existing entries in documents.data->'history' can't be edited or removed.
--    New entries may only be appended. A save from a stale device that simply lacks the newest entries
--    (a shorter, otherwise identical prefix) gets them put back instead of failing the whole save;
--    any edit, reorder or removal from the middle is rejected.
create or replace function public.documents_history_append_only()
returns trigger language plpgsql as $$
declare
  old_h jsonb := case when jsonb_typeof(old.data -> 'history') = 'array' then old.data -> 'history' else '[]'::jsonb end;
  new_h jsonb := case when jsonb_typeof(new.data -> 'history') = 'array' then new.data -> 'history' else '[]'::jsonb end;
  n_old int := jsonb_array_length(old_h);
  n_new int := jsonb_array_length(new_h);
  i int;
begin
  if n_old = 0 then return new; end if;
  for i in 0 .. least(n_old, n_new) - 1 loop
    if (new_h -> i) is distinct from (old_h -> i) then
      raise exception 'Document history is append-only: entry % cannot be changed or removed', i + 1
        using errcode = 'check_violation';
    end if;
  end loop;
  if n_new < n_old then
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{history}', old_h, true);
  end if;
  return new;
end $$;

drop trigger if exists documents_history_append_only on public.documents;
create trigger documents_history_append_only
  before update of data on public.documents
  for each row execute function public.documents_history_append_only();

commit;

-- 5) Verification (read-only; uses literal sample data, touches no rows).
with s as (
  select '{"invoiceNumber":"INV-T","jobMiles":"9",
           "approval":{"status":"approved","approvedAt":"2026-10-24T03:29:00Z","method":"phone","approvedBy":"Pat","markedBy":"Pat","approverName":"Pat (by phone)","note":"internal","token":"tok"},
           "history":[{"at":"2026-10-24T03:29:00Z","by":"Pat","byId":"11111111-2222-3333-4444-555555555555","action":"Approved by phone","note":"internal"},
                      {"at":"2026-10-24T03:30:00Z","by":"Pat","action":"secret action"}]}'::jsonb as d
), out as (select public.public_document_data(d)::text as t, public.public_document_data(d) as j from s)
select 'portal hides owner id/name/notes/token' as check,
       case when t !~ '(11111111-2222|Pat|internal|tok"|byId|secret action|jobMiles)' then 'ok' else 'FAIL: ' || t end as result from out
union all
select 'portal history is sanitized',
       case when j -> 'history' = '[{"at":"2026-10-24T03:29:00Z","event":"approved_by_phone"}]'::jsonb then 'ok' else 'FAIL: ' || (j -> 'history')::text end from out
union all
select 'approval-link function sanitizes',
       case when position('public_history_data' in pg_get_functiondef('public.get_document_by_approval_token(text)'::regprocedure)) > 0
             and position('public_approval_data' in pg_get_functiondef('public.get_document_by_approval_token(text)'::regprocedure)) > 0 then 'ok' else 'FAIL' end
union all
select 'portal RPCs use public_document_data',
       case when position('public_document_data' in pg_get_functiondef('public.get_client_portal(text)'::regprocedure)) > 0
             and position('public_document_data' in pg_get_functiondef('public.get_portal_document(text,uuid)'::regprocedure)) > 0 then 'ok' else 'FAIL' end
union all
select 'append-only trigger installed',
       case when exists (select 1 from pg_trigger where tgname = 'documents_history_append_only' and tgrelid = 'public.documents'::regclass and tgenabled <> 'D') then 'ok' else 'FAIL' end
union all
select 'sanitizers not callable by anon',
       case when not has_function_privilege('anon', 'public.public_history_data(jsonb)', 'execute')
             and not has_function_privilege('anon', 'public.public_approval_data(jsonb)', 'execute') then 'ok' else 'FAIL' end;

-- Optional behavioural test of the trigger (rolls back, changes nothing). Uncomment to run:
-- begin;
--   create temp table _t as select id from public.documents where jsonb_array_length(coalesce(data->'history','[]')) > 0 limit 1;
--   update public.documents set data = jsonb_set(data, '{history,0,note}', '"edited"') where id in (select id from _t); -- expect ERROR: append-only
-- rollback;
