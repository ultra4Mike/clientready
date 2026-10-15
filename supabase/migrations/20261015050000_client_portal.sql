-- Client portal: one no-login link per client. Safe to re-run.
-- Run after 20261015030000_stripe_payments.sql.
--
-- The customer with the link sees that client's sent invoices/proposals (never drafts), can
-- approve + sign, see payments/balance and (server side) pay by card. Anon users still have no
-- table access; everything goes through the SECURITY DEFINER functions below, keyed on the
-- unguessable token, scoped to the token's owner AND client.

create table if not exists public.client_portals (
  token text primary key,
  owner_id uuid not null default auth.uid(),
  client_key text not null,
  client_name text not null default '',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_portals_token_len') then
    alter table public.client_portals add constraint client_portals_token_len check (length(token) >= 32);
  end if;
end $$;
create index if not exists client_portals_owner_client_idx on public.client_portals (owner_id, client_key);

alter table public.client_portals enable row level security;
drop policy if exists client_portals_owner on public.client_portals;
create policy client_portals_owner on public.client_portals for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.client_portals from anon;
grant select, insert, update, delete on public.client_portals to authenticated;

-- Normalized client name used to match documents to a portal.
create or replace function public.portal_client_key(p_name text)
returns text language sql immutable as $$ select lower(btrim(coalesce(p_name, ''))) $$;

-- The customer-safe copy of a document's data. Internal: not callable by anon.
create or replace function public.public_document_data(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then (p_data -> 'approval') - 'token' else null end,
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;

-- Documents visible through a portal: same owner, same client, invoice/proposal, already sent
-- (status not draft) or shared for approval. Internal.
create or replace function public.portal_documents(p_token text)
returns setof public.documents
language sql
stable
security definer
set search_path = public
as $$
  select d.*
    from public.client_portals cp
    join public.documents d
      on d.user_id = cp.owner_id
     and public.portal_client_key(coalesce(nullif(d.data ->> 'clientName', ''), d.client_name)) = cp.client_key
   where p_token is not null and length(p_token) >= 32
     and cp.token = p_token and cp.revoked_at is null
     and d.type in ('invoice', 'proposal')
     and (coalesce(d.data ->> 'status', 'draft') <> 'draft' or d.data ? 'approval')
$$;
revoke all on function public.portal_documents(text) from public, anon, authenticated;

create or replace function public.portal_business(p_owner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', coalesce(p.business_name, ''), 'logo', coalesce(p.logo, ''),
    'paymentLink', coalesce(p.payment_link, ''), 'email', coalesce(p.email, ''), 'phone', coalesce(p.phone, ''))
    from (select 1) one left join public.profiles p on p.id = p_owner
$$;
revoke all on function public.portal_business(uuid) from public, anon, authenticated;

-- Public: the portal's client name, business card and documents (customer-safe data).
create or replace function public.get_client_portal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cp public.client_portals%rowtype;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into cp from public.client_portals where token = p_token and revoked_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'clientName', cp.client_name,
    'business', public.portal_business(cp.owner_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type, 'title', d.title, 'clientName', d.client_name,
                                          'data', public.public_document_data(d.data)) order by d.created_at desc)
        from public.portal_documents(p_token) d), '[]'::jsonb));
end;
$$;

-- Public: one document of the portal, in the same shape as get_document_by_approval_token.
create or replace function public.get_portal_document(p_token text, p_doc_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('type', d.type, 'title', d.title, 'clientName', d.client_name,
                            'data', public.public_document_data(d.data), 'business', public.portal_business(d.user_id))
    from public.portal_documents(p_token) d
   where d.id = p_doc_id
   limit 1
$$;

-- Public: approve (and optionally sign) a portal document. Only changes data.approval, only
-- when not yet approved. Signature: {"type":"drawn","dataUrl":"data:image/png;base64,.."} or
-- {"type":"typed","text":..}, plus "signerName"; the server
-- sets signedAt. Returns the approval block without token, or null.
create or replace function public.portal_approve(p_token text, p_doc_id uuid, p_name text default null, p_signature jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  sig jsonb := null;
  nm text := left(btrim(coalesce(p_name, '')), 100);
  result jsonb;
begin
  if not exists (select 1 from public.portal_documents(p_token) d where d.id = p_doc_id) then return null; end if;
  if p_signature is not null and jsonb_typeof(p_signature) = 'object' then
    if p_signature ->> 'type' = 'drawn'
       and coalesce(p_signature ->> 'dataUrl', '') like 'data:image/png;base64,%'
       and length(p_signature ->> 'dataUrl') <= 200000 then
      sig := jsonb_build_object('type', 'drawn', 'dataUrl', p_signature ->> 'dataUrl');
    elsif p_signature ->> 'type' = 'typed' and length(btrim(coalesce(p_signature ->> 'text', ''))) > 0 then
      sig := jsonb_build_object('type', 'typed', 'text', left(btrim(p_signature ->> 'text'), 100));
    end if;
    if sig is not null then
      sig := sig || jsonb_build_object('signerName', coalesce(nullif(left(btrim(coalesce(p_signature ->> 'signerName', '')), 100), ''), nm),
                                      'signedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
  end if;
  update public.documents
     set data = jsonb_set(data, '{approval}',
           coalesce(data -> 'approval', jsonb_build_object('createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
           || jsonb_build_object(
                'status', 'approved',
                'approvedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'approverName', coalesce(nullif(nm, ''), sig ->> 'signerName', ''),
                'via', 'portal')
           || case when sig is not null then jsonb_build_object('signature', sig) else '{}'::jsonb end)
   where id = p_doc_id
     and coalesce(data -> 'approval' ->> 'status', '') <> 'approved'
  returning (data -> 'approval') - 'token' into result;
  return result;
end;
$$;

revoke all on function public.get_client_portal(text) from public;
revoke all on function public.get_portal_document(text, uuid) from public;
revoke all on function public.portal_approve(text, uuid, text, jsonb) from public;
grant execute on function public.get_client_portal(text) to anon, authenticated;
grant execute on function public.get_portal_document(text, uuid) to anon, authenticated;
grant execute on function public.portal_approve(text, uuid, text, jsonb) to anon, authenticated;

-- Server only (service role): the invoice behind a portal link + document id, for Stripe Checkout.
create or replace function public.stripe_invoice_for_portal(p_token text, p_doc_id uuid)
returns table (id uuid, type text, title text, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.type, d.title, d.data from public.portal_documents(p_token) d where d.id = p_doc_id limit 1
$$;
revoke all on function public.stripe_invoice_for_portal(text, uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.stripe_invoice_for_portal(text, uuid) to service_role';
  end if;
end $$;
