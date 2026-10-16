-- Per-owner payment methods (Zelle, Venmo, Cash App, PayPal.me, check, bank/ACH) shown to the owner's customers.
-- Add-only and safe to re-run. Nothing here records or marks a payment.
alter table public.profiles add column if not exists payment_methods jsonb not null default '{}'::jsonb;

-- Customer-safe copy: only enabled methods and only their display fields (no other profile data).
create or replace function public.public_payment_methods(p_methods jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(k, v - 'enabled'), '{}'::jsonb)
    from (
      select key as k,
             jsonb_strip_nulls(jsonb_build_object(
               'enabled', value -> 'enabled',
               'handle', left(value ->> 'handle', 200),
               'payTo', left(value ->> 'payTo', 200),
               'address', left(value ->> 'address', 500),
               'instructions', left(value ->> 'instructions', 1000))) as v
        from jsonb_each(case when jsonb_typeof(p_methods) = 'object' then p_methods else '{}'::jsonb end)
       where key in ('zelle', 'venmo', 'cashapp', 'paypal', 'check', 'bank')
         and jsonb_typeof(value) = 'object'
         and (value ->> 'enabled') = 'true'
    ) enabled
$$;

-- Public (approval link or client portal link): the business's enabled payment methods, or null for a bad link.
create or replace function public.get_payment_methods(p_token text default null, p_portal text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_token is not null and length(p_token) >= 32 then
    select user_id into v_owner from public.documents where data -> 'approval' ->> 'token' = p_token limit 1;
  elsif p_portal is not null and length(p_portal) >= 32 then
    select owner_id into v_owner from public.client_portals where token = p_portal and revoked_at is null limit 1;
  end if;
  if v_owner is null then
    return null;
  end if;
  return (select public.public_payment_methods(payment_methods) from public.profiles where id = v_owner);
end;
$$;
revoke all on function public.get_payment_methods(text, text) from public;
grant execute on function public.get_payment_methods(text, text) to anon, authenticated;
