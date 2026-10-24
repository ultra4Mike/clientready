-- Roadmap: card tip on Stripe payments + public online booking form. Re-runnable.

-- 1. Tip: set payment.tip on the Stripe payment row (id 'stripe_<session>'). Never changes amount/paymentAmount,
--    so the invoice total, balance and tax are untouched. Service role only (webhook / confirm route).
create or replace function public.set_stripe_payment_tip(p_doc_id text, p_session_id text, p_tip numeric)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_doc uuid; v_data jsonb; v_pay jsonb; v_id text := 'stripe_' || coalesce(p_session_id, '');
begin
  if p_tip is null or p_tip <= 0 or p_tip > 5000 or coalesce(p_session_id, '') = '' then return false; end if;
  begin v_doc := p_doc_id::uuid; exception when others then return false; end;
  select data into v_data from documents where id = v_doc and type = 'invoice' for update;
  if not found or jsonb_typeof(v_data -> 'payments') <> 'array' then return false; end if;
  select jsonb_agg(case when e ->> 'id' = v_id then e || jsonb_build_object('tip', to_char(round(p_tip, 2), 'FM999999990.00')) else e end)
    into v_pay from jsonb_array_elements(v_data -> 'payments') e;
  if not exists (select 1 from jsonb_array_elements(v_pay) e where e ->> 'id' = v_id) then return false; end if;
  update documents set data = v_data || jsonb_build_object('payments', v_pay) where id = v_doc;
  return true;
end $$;
revoke all on function public.set_stripe_payment_tip(text, text, numeric) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.set_stripe_payment_tip(text, text, numeric) to service_role';
  end if;
end $$;

-- 2. Online booking. Owner settings on profiles (RLS profiles_owner already covers them).
alter table public.profiles add column if not exists booking_enabled boolean not null default false;
alter table public.profiles add column if not exists booking_slug text;
alter table public.profiles add column if not exists booking_services jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_booking_slug_format') then
    alter table public.profiles add constraint profiles_booking_slug_format check (booking_slug is null or booking_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_booking_services_size') then
    alter table public.profiles add constraint profiles_booking_services_size check (jsonb_typeof(booking_services) = 'array' and pg_column_size(booking_services) < 4000);
  end if;
end $$;
create unique index if not exists profiles_booking_slug_unique on public.profiles (lower(booking_slug)) where booking_slug is not null;

-- Requests: owners read/update/delete their own; only the RPC below inserts.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  client_id text,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  service text not null default '',
  preferred text not null default '',
  note text not null default '',
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'seen', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint booking_requests_photos_size check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 3 and pg_column_size(photos) < 1500000)
);
create index if not exists booking_requests_owner_idx on public.booking_requests (owner_id, created_at desc);
alter table public.booking_requests enable row level security;
drop policy if exists booking_requests_owner on public.booking_requests;
create policy booking_requests_owner on public.booking_requests for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.booking_requests from anon, authenticated;
grant select, update, delete on public.booking_requests to authenticated;

-- Owner lookup by slug or id, only when booking is on.
create or replace function public.booking_owner(p_owner text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from profiles p
   where p.booking_enabled
     and (lower(p.booking_slug) = lower(coalesce(p_owner, '')) or p.id::text = lower(coalesce(p_owner, '')))
   limit 1;
$$;
revoke all on function public.booking_owner(text) from public, anon, authenticated;

-- Public page: business name + services only.
create or replace function public.get_booking_page(p_owner text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.booking_owner(p_owner); out jsonb;
begin
  if v is null then return null; end if;
  select jsonb_build_object('business', coalesce(nullif(business_name, ''), 'Book a service'), 'services', booking_services)
    into out from profiles where id = v;
  return out;
end $$;
revoke all on function public.get_booking_page(text) from public;
grant execute on function public.get_booking_page(text) to anon, authenticated;

-- Submit: validates, rate limits (per owner 20/hour, 300/hour overall), matches a client by email/phone or
-- creates one, and stores the request (the owner's in-app dashboard alert). No email is sent.
create or replace function public.submit_booking_request(p_owner text, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_owner uuid := public.booking_owner(p_owner);
  h timestamptz := date_trunc('hour', now()); a int; o int;
  v_name text := left(btrim(coalesce(p ->> 'name', '')), 120);
  v_phone text := left(btrim(coalesce(p ->> 'phone', '')), 40);
  v_email text := lower(left(btrim(coalesce(p ->> 'email', '')), 200));
  v_address text := left(btrim(coalesce(p ->> 'address', '')), 300);
  v_service text := left(btrim(coalesce(p ->> 'service', '')), 120);
  v_pref text := left(btrim(coalesce(p ->> 'preferred', '')), 300);
  v_note text := left(btrim(coalesce(p ->> 'note', '')), 2000);
  v_photos jsonb := coalesce(p -> 'photos', '[]'::jsonb);
  v_digits text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  v_client text; v_id uuid;
begin
  if v_owner is null then return jsonb_build_object('error', 'not_found'); end if;
  if coalesce(p ->> 'website', '') <> '' then return jsonb_build_object('ok', true); end if; -- honeypot: pretend success
  insert into approval_hits values (h, 'book:all', 1) on conflict (minute, key) do update set n = approval_hits.n + 1 returning n into a;
  insert into approval_hits values (h, 'book:' || v_owner::text, 1) on conflict (minute, key) do update set n = approval_hits.n + 1 returning n into o;
  if a > 300 or o > 20 then return jsonb_build_object('error', 'rate'); end if;
  if v_name = '' or (v_email = '' and length(v_digits) < 7) then return jsonb_build_object('error', 'invalid'); end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('error', 'invalid'); end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 3
     or exists (select 1 from jsonb_array_elements(v_photos) e where jsonb_typeof(e) <> 'string' or e #>> '{}' !~ '^data:image/(jpeg|png|webp);base64,' or length(e #>> '{}') > 450000) then
    return jsonb_build_object('error', 'photos');
  end if;
  if v_service <> '' and not exists (select 1 from profiles pr, jsonb_array_elements_text(pr.booking_services) s where pr.id = v_owner and s = v_service) then
    v_service := left('Other: ' || v_service, 120);
  end if;

  select c.id into v_client from clients c
   where c.user_id = v_owner
     and ((v_email <> '' and lower(c.email) = v_email) or (length(v_digits) >= 7 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits))
   order by c.created_at limit 1;
  if v_client is null then
    insert into clients (user_id, name, email, phone, address, notes)
    values (v_owner, v_name, v_email, v_phone, v_address, 'Added from online booking')
    returning id into v_client;
  end if;
  insert into booking_requests (owner_id, client_id, name, phone, email, address, service, preferred, note, photos)
  values (v_owner, v_client, v_name, v_phone, v_email, v_address, v_service, v_pref, v_note, v_photos)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.submit_booking_request(text, jsonb) from public;
grant execute on function public.submit_booking_request(text, jsonb) to anon, authenticated;

-- The /api/book route calls these with the service role (IP rate limit + honeypot run there first).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.get_booking_page(text) to service_role';
    execute 'grant execute on function public.submit_booking_request(text, jsonb) to service_role';
    execute 'grant select, update, delete on public.booking_requests to service_role';
  end if;
end $$;
