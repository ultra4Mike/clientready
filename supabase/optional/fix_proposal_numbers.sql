-- OPTIONAL (Help live check, INV-1022 on a draft proposal). Safe to re-run. Not a migration.
-- Part 1: the number trigger never gives a proposal an INV- prefix (or an invoice PROP-) when it renumbers a clash.
create or replace function public.documents_take_number()
returns trigger
language plpgsql set search_path = public
as $$
declare v_num text; v_prefix text; v_max bigint; v_next text;
begin
  if new.type not in ('invoice', 'proposal') then return new; end if;
  if current_user not in ('authenticated', 'service_role', 'anon') then return new; end if;
  v_num := trim(coalesce(new.data ->> 'invoiceNumber', ''));
  if v_num = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.type));
  if not exists (select 1 from public.documents d where d.user_id = new.user_id and d.type = new.type and d.id <> new.id and trim(coalesce(d.data ->> 'invoiceNumber', '')) = v_num) then
    return new;
  end if;
  v_prefix := coalesce((select prefix from public.doc_number_parts(v_num)), '');
  if v_prefix = '' or (new.type = 'proposal' and upper(v_prefix) in ('INV-', 'INV')) or (new.type = 'invoice' and upper(v_prefix) in ('PROP-', 'PROP')) then
    v_prefix := case when new.type = 'proposal' then 'PROP-' else 'INV-' end;
  end if;
  select coalesce(max((select n from public.doc_number_parts(d.data ->> 'invoiceNumber'))), 1000) into v_max
    from public.documents d where d.user_id = new.user_id and d.type = new.type
     and coalesce((select prefix from public.doc_number_parts(d.data ->> 'invoiceNumber')), '') = v_prefix;
  v_next := v_prefix || (v_max + 1)::text;
  new.data := jsonb_set(new.data, '{invoiceNumber}', to_jsonb(v_next)) || jsonb_build_object('renumberedFrom', v_num);
  if trim(coalesce(new.title, '')) = v_num then new.title := v_next; end if;
  return new;
end;
$$;

-- Part 2 (look first, changes nothing): proposals that carry an INV- number.
select id, data->>'invoiceNumber' as number, data->>'status' as status, title, created_at
  from public.documents
 where type = 'proposal' and data->>'invoiceNumber' ~* '^INV-?\d+$'
 order by created_at;

-- Part 3 (optional fix): renumber ONLY unsent draft proposals with an INV- number to the next PROP- number.
-- Sent proposals are left alone (the client already has that number). Run once per bad row.
-- with target as (
--   select id, user_id, data->>'invoiceNumber' as old from public.documents
--    where type = 'proposal' and data->>'invoiceNumber' ~* '^INV-?\d+$' and coalesce(data->>'status','draft') = 'draft'
--      and data->'approval' is null
--    order by created_at limit 1
-- ), nxt as (
--   select t.id, t.old, 'PROP-' || (coalesce(max((select n from public.doc_number_parts(d.data->>'invoiceNumber'))), 1000) + 1) as num
--     from target t left join public.documents d on d.user_id = t.user_id and d.type = 'proposal'
--      and (select prefix from public.doc_number_parts(d.data->>'invoiceNumber')) = 'PROP-'
--    group by t.id, t.old
-- )
-- update public.documents doc
--    set data = doc.data || jsonb_build_object('invoiceNumber', nxt.num, 'renumberedFrom', nxt.old),
--        title = case when trim(coalesce(doc.title,'')) = nxt.old then nxt.num else doc.title end
--   from nxt where doc.id = nxt.id
-- returning doc.id, doc.data->>'invoiceNumber' as new_number;
