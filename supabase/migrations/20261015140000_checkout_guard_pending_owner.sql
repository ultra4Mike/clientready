-- Checkout double-start guard + owner on Stripe tables. MUST BE RUN MANUALLY. Safe to re-run.
-- Run after 20261015130000_stripe_reliability.sql.
--
-- 1. At most ONE open Checkout per invoice (unique partial index). The checkout route inserts a claim
--    row before calling Stripe; a near-simultaneous second request hits this index and is refused.
-- 2. owner_id on stripe_checkout_sessions / stripe_pending_payments so the owner can see payments
--    that could not be recorded even if the invoice is gone from the cloud.

alter table public.stripe_checkout_sessions add column if not exists owner_id uuid;
alter table public.stripe_pending_payments add column if not exists owner_id uuid;

-- Keep only the newest open row per invoice before adding the unique index.
update public.stripe_checkout_sessions s set status = 'expired'
 where s.status = 'open'
   and exists (select 1 from public.stripe_checkout_sessions n
                where n.doc_id = s.doc_id and n.status = 'open'
                  and (n.created_at, n.session_id) > (s.created_at, s.session_id));

create unique index if not exists stripe_checkout_one_open_per_doc
  on public.stripe_checkout_sessions (doc_id) where status = 'open';

create index if not exists stripe_pending_unresolved
  on public.stripe_pending_payments (owner_id) where resolved_at is null;

-- Fill owner_id on pending rows from the checkout session that created them.
create or replace function public.stripe_pending_set_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then
    select c.owner_id into new.owner_id from public.stripe_checkout_sessions c where c.session_id = new.session_id;
  end if;
  return new;
end $$;
drop trigger if exists stripe_pending_set_owner on public.stripe_pending_payments;
create trigger stripe_pending_set_owner before insert or update on public.stripe_pending_payments
  for each row execute function public.stripe_pending_set_owner();
revoke all on function public.stripe_pending_set_owner() from public, anon, authenticated;

update public.stripe_pending_payments p set owner_id = c.owner_id
  from public.stripe_checkout_sessions c
 where c.session_id = p.session_id and p.owner_id is null;
