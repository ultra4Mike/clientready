-- R101: no new duplicate invoice/proposal numbers. Safe to re-run.
-- Run after 20261024120000_stripe_refunds.sql.
-- 1. New documents only: a BEFORE INSERT trigger takes the number under a per-owner lock. If the wanted
--    number is already used by another doc of that owner and type (e.g. made offline on two phones),
--    the new doc gets the next free number (title too when it was the number). Existing docs are never
--    renumbered here. Only app/API inserts (roles authenticated/service_role/anon); admin SQL is untouched.
-- 2. duplicate_doc_numbers(): the owner's existing duplicates (for the "Fix duplicate numbers" tool).
-- 3. The unique index is created ONLY when the account data has no duplicates left; otherwise it is
--    skipped with a notice. Re-run this file after the owner fixes duplicates.
--
-- Check SQL (duplicates still present, all accounts):
--   select user_id, type, data->>'invoiceNumber' as number, count(*) from public.documents
--    where type in ('invoice','proposal') and coalesce(data->>'invoiceNumber','') <> ''
--    group by 1,2,3 having count(*) > 1 order by 1,2,3;
-- Index present?  select to_regclass('public.documents_owner_number_unique');

create or replace function public.doc_number_parts(p_number text)
returns table(prefix text, n bigint)
language sql immutable
set search_path = public
as $$
  select coalesce(substring(p_number from '^(.*?)\d+\s*$'), ''), nullif(substring(p_number from '(\d+)\s*$'), '')::bigint
$$;

-- Security invoker on purpose: current_user is the inserting role, and RLS already limits it to the owner's docs.
create or replace function public.documents_take_number()
returns trigger
language plpgsql set search_path = public
as $$
declare v_num text; v_prefix text; v_max bigint; v_next text;
begin
  if new.type not in ('invoice', 'proposal') then return new; end if;
  -- App and API inserts only (admin/SQL imports are left as written).
  if current_user not in ('authenticated', 'service_role', 'anon') then return new; end if;
  v_num := trim(coalesce(new.data ->> 'invoiceNumber', ''));
  if v_num = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.type));
  if not exists (select 1 from public.documents d where d.user_id = new.user_id and d.type = new.type and d.id <> new.id and trim(coalesce(d.data ->> 'invoiceNumber', '')) = v_num) then
    return new;
  end if;
  v_prefix := coalesce((select prefix from public.doc_number_parts(v_num)), '');
  if v_prefix = '' then v_prefix := case when new.type = 'proposal' then 'PROP-' else 'INV-' end; end if;
  select coalesce(max((select n from public.doc_number_parts(d.data ->> 'invoiceNumber'))), 1000) into v_max
    from public.documents d where d.user_id = new.user_id and d.type = new.type
     and coalesce((select prefix from public.doc_number_parts(d.data ->> 'invoiceNumber')), '') = v_prefix;
  v_next := v_prefix || (v_max + 1)::text;
  new.data := jsonb_set(new.data, '{invoiceNumber}', to_jsonb(v_next)) || jsonb_build_object('renumberedFrom', v_num);
  if trim(coalesce(new.title, '')) = v_num then new.title := v_next; end if;
  return new;
end;
$$;
drop trigger if exists documents_take_number on public.documents;
create trigger documents_take_number before insert on public.documents for each row execute function public.documents_take_number();

create or replace function public.duplicate_doc_numbers()
returns table(doc_type text, number text, ids uuid[])
language sql stable security definer set search_path = public
as $$
  select d.type, trim(d.data ->> 'invoiceNumber'), array_agg(d.id order by d.created_at)
    from public.documents d
   where d.user_id = auth.uid() and d.type in ('invoice', 'proposal') and trim(coalesce(d.data ->> 'invoiceNumber', '')) <> ''
   group by 1, 2 having count(*) > 1 order by 1, 2
$$;
revoke all on function public.duplicate_doc_numbers() from public, anon;
grant execute on function public.duplicate_doc_numbers() to authenticated;

do $$
begin
  if to_regclass('public.documents_owner_number_unique') is not null then return; end if;
  if exists (select 1 from public.documents where type in ('invoice', 'proposal') and trim(coalesce(data ->> 'invoiceNumber', '')) <> ''
              group by user_id, type, trim(data ->> 'invoiceNumber') having count(*) > 1) then
    raise notice 'R101: duplicate numbers exist; unique index NOT created. Fix them (Documents > Fix duplicate numbers), then re-run this file.';
  else
    create unique index documents_owner_number_unique on public.documents (user_id, type, (trim(data ->> 'invoiceNumber')))
     where type in ('invoice', 'proposal') and trim(coalesce(data ->> 'invoiceNumber', '')) <> '';
  end if;
end $$;
