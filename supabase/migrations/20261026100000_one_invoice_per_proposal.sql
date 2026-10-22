-- R128 fix: one invoice per proposal (auto-convert idempotent, also under a double tap / webhook race).
-- Idempotent: safe to run again.
--
-- TRUE checks (each should return true after running):
--   select to_regclass('public.documents_one_invoice_per_proposal') is not null;
--   select not exists (
--     select 1 from public.documents
--     where type = 'invoice' and data -> 'fromProposal' ->> 'id' is not null
--       and coalesce(data ->> 'deleted', 'false') <> 'true' and coalesce(data ->> 'status', '') <> 'void'
--     group by user_id, data -> 'fromProposal' ->> 'id' having count(*) > 1);

-- 1) Extra invoices made from the same proposal with NO payments recorded are voided (kept, not deleted);
--    the oldest one stays. Duplicates that already hold payments are left alone for the owner to review.
with ranked as (
  select id, row_number() over (partition by user_id, data -> 'fromProposal' ->> 'id' order by created_at, id) as rn
  from public.documents
  where type = 'invoice' and data -> 'fromProposal' ->> 'id' is not null
    and coalesce(data ->> 'deleted', 'false') <> 'true' and coalesce(data ->> 'status', '') <> 'void'
)
update public.documents d
set data = d.data || jsonb_build_object('status', 'void', 'voidReason', 'Duplicate invoice from the same proposal')
from ranked r
where d.id = r.id and r.rn > 1
  and coalesce(jsonb_array_length(case when jsonb_typeof(d.data -> 'payments') = 'array' then d.data -> 'payments' end), 0) = 0
  and coalesce(nullif(regexp_replace(coalesce(d.data ->> 'paymentAmount', ''), '[^0-9.]', '', 'g'), ''), '0')::numeric = 0;

-- 2) The rule itself.
do $$
begin
  if to_regclass('public.documents_one_invoice_per_proposal') is not null then return; end if;
  if exists (
    select 1 from public.documents
    where type = 'invoice' and data -> 'fromProposal' ->> 'id' is not null
      and coalesce(data ->> 'deleted', 'false') <> 'true' and coalesce(data ->> 'status', '') <> 'void'
    group by user_id, data -> 'fromProposal' ->> 'id' having count(*) > 1
  ) then
    raise notice 'documents_one_invoice_per_proposal NOT created: duplicate invoices with payments exist. Void one, then run this file again.';
    return;
  end if;
  create unique index documents_one_invoice_per_proposal on public.documents (user_id, (data -> 'fromProposal' ->> 'id'))
    where type = 'invoice' and data -> 'fromProposal' ->> 'id' is not null
      and coalesce(data ->> 'deleted', 'false') <> 'true' and coalesce(data ->> 'status', '') <> 'void';
end $$;
