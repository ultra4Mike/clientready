-- Crew cost categories match the owner's job costs: parts, gas, tools (job supplies), dump, lunch, other.
-- 1) crew_add_expense accepts the two new keys (tools, lunch). Same body as 20261015020000 otherwise;
--    the keyed overload from 20261016100000 calls this one, so it picks the change up.
-- 2) job_drafts.costs: the crew job report's cost lines [{kind, amount, note, receipt}]. parts_cost /
--    parts_note stay filled (total + summary) so older screens keep working.
-- Add-only and re-runnable.
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
  if p_kind not in ('gas', 'parts', 'tools', 'dump', 'lunch', 'other') then
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
$function$
;

alter table public.job_drafts add column if not exists costs jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'job_drafts_costs_size') then
    alter table public.job_drafts add constraint job_drafts_costs_size
      check (jsonb_typeof(costs) = 'array' and jsonb_array_length(costs) <= 20 and octet_length(costs::text) <= 12000000);
  end if;
end $$;
