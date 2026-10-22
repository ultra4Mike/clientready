-- Crew cost categories = the owner's own cost lines for that job (incl. custom named lines).
-- 1) crew_jobs.cost_lines: the job's custom cost-line NAMES only (text[], never amounts/prices), written by the owner app.
-- 2) crew_add_expense accepts the 6 standard keys or 'fee:<name>' where <name> is in that job's cost_lines.
-- Idempotent: safe to run more than once. Check queries at the bottom return TRUE.

alter table public.crew_jobs add column if not exists cost_lines text[] not null default '{}'::text[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crew_jobs_cost_lines_size') then
    alter table public.crew_jobs add constraint crew_jobs_cost_lines_size
      check (cardinality(cost_lines) <= 20 and octet_length(array_to_string(cost_lines, '|')) <= 2000);
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.crew_add_expense(p_doc_id text, p_kind text, p_amount text, p_note text, p_receipt text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
  v_amount numeric;
begin
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  begin
    v_amount := nullif(regexp_replace(coalesce(p_amount, ''), '[^0-9.]', '', 'g'), '')::numeric;
  exception when others then
    v_amount := null;
  end;
  if v_amount is null or v_amount <= 0 or v_amount > 100000 then
    raise exception 'amount is not valid' using errcode = 'P0001';
  end if;
  if p_kind not in ('gas', 'parts', 'tools', 'dump', 'lunch', 'other')
     and not (p_kind like 'fee:%' and length(p_kind) <= 64 and exists (
       select 1 from public.crew_jobs j
        where j.doc_id = p_doc_id and j.owner_id = a.owner_id
          and lower(substr(p_kind, 5)) = any (select lower(n) from unnest(j.cost_lines) n))) then
    raise exception 'category is not valid' using errcode = 'P0001';
  end if;
  if length(coalesce(p_receipt, '')) > 3000000 or (coalesce(p_receipt, '') <> '' and p_receipt not like 'data:image/%') then
    raise exception 'receipt is not valid' using errcode = 'P0001';
  end if;
  insert into public.crew_expenses (id, owner_id, doc_id, worker_email, worker_name, employee_id, kind, amount, note, receipt)
  values (gen_random_uuid()::text, a.owner_id, p_doc_id, public.crew_email(), a.worker_name, a.employee_id,
          p_kind, to_char(v_amount, 'FM999999990.00'), left(coalesce(p_note, ''), 300), coalesce(p_receipt, ''));
  return true;
end;
$function$;

revoke all on function public.crew_add_expense(text, text, text, text, text) from public, anon;
grant execute on function public.crew_add_expense(text, text, text, text, text) to authenticated;

-- Checks (each returns TRUE):
-- select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crew_jobs' and column_name = 'cost_lines') as cost_lines_column;
-- select exists (select 1 from pg_constraint where conname = 'crew_jobs_cost_lines_size') as cost_lines_limit;
-- select position('fee:%' in pg_get_functiondef('public.crew_add_expense(text,text,text,text,text)'::regprocedure)) > 0 as custom_types_validated;
-- select (select udt_name from information_schema.columns where table_schema = 'public' and table_name = 'crew_jobs' and column_name = 'cost_lines') = '_text' as names_only_text_array;
