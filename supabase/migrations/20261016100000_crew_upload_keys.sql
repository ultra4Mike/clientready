-- R14: crew uploads are idempotent. The phone sends a stable client key per upload (the offline-queue
-- item id); if the server already has that key (the reply was lost and the phone retried), nothing is
-- added again. Add-only and re-runnable.
--
-- New two-argument-name overloads take p_client_key and wrap the existing functions, so any later
-- version of crew_mark_done / crew_add_expense keeps applying. The old signatures stay for older app
-- versions (PostgREST picks the overload by argument names, so there is no ambiguity).

alter table public.crew_job_photos add column if not exists client_key text;
alter table public.crew_expenses add column if not exists client_key text;
create unique index if not exists crew_job_photos_client_key on public.crew_job_photos (client_key) where client_key is not null;
create unique index if not exists crew_expenses_client_key on public.crew_expenses (client_key) where client_key is not null;

create or replace function public.crew_mark_done(p_doc_id text, p_photos text[], p_client_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key text := left(coalesce(p_client_key, ''), 80);
  v_ok boolean;
begin
  if v_key = '' then
    return public.crew_mark_done(p_doc_id, p_photos);
  end if;
  -- Already received (same person, same job): report success without adding anything.
  if exists (select 1 from public.crew_job_photos
              where client_key like v_key || ':%' and doc_id = p_doc_id and lower(worker_email) = public.crew_email()) then
    return true;
  end if;
  begin
    v_ok := public.crew_mark_done(p_doc_id, p_photos);
    -- Tag the rows this call just inserted (same transaction => same now()).
    with mine as (
      select id, row_number() over (order by id) as n from public.crew_job_photos
       where doc_id = p_doc_id and lower(worker_email) = public.crew_email() and client_key is null and created_at = now()
    )
    update public.crew_job_photos p set client_key = v_key || ':' || mine.n from mine where p.id = mine.id;
  exception when unique_violation then
    return true; -- a parallel retry with the same key won; this one adds nothing
  end;
  return v_ok;
end;
$$;
revoke all on function public.crew_mark_done(text, text[], text) from public, anon;
grant execute on function public.crew_mark_done(text, text[], text) to authenticated;

create or replace function public.crew_add_expense(p_doc_id text, p_kind text, p_amount text, p_note text, p_receipt text, p_client_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_key text := left(coalesce(p_client_key, ''), 80);
  v_ok boolean;
begin
  if v_key = '' then
    return public.crew_add_expense(p_doc_id, p_kind, p_amount, p_note, p_receipt);
  end if;
  if exists (select 1 from public.crew_expenses
              where client_key = v_key and doc_id = p_doc_id and lower(worker_email) = public.crew_email()) then
    return true;
  end if;
  begin
    v_ok := public.crew_add_expense(p_doc_id, p_kind, p_amount, p_note, p_receipt);
    update public.crew_expenses set client_key = v_key
     where doc_id = p_doc_id and lower(worker_email) = public.crew_email() and client_key is null and created_at = now();
  exception when unique_violation then
    return true;
  end;
  return v_ok;
end;
$$;
revoke all on function public.crew_add_expense(text, text, text, text, text, text) from public, anon;
grant execute on function public.crew_add_expense(text, text, text, text, text, text) to authenticated;
