-- Client portal keyed by a stable client id. Safe to re-run.
-- Run after 20261015060000_crew_done_photos.sql (needs 20261015050000_client_portal.sql).
--
-- Documents created/edited from a saved client carry data.clientId. A portal with a client_id shows
-- the documents with that clientId, so renaming the client does not change what the portal shows.
-- Legacy documents without a clientId (and legacy portals without a client_id) still match by the
-- normalized client name, exactly as before.

alter table public.client_portals add column if not exists client_id text;
create index if not exists client_portals_owner_client_id_idx on public.client_portals (owner_id, client_id);

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
     and case
           when coalesce(cp.client_id, '') <> '' and coalesce(d.data ->> 'clientId', '') <> ''
             then d.data ->> 'clientId' = cp.client_id
           else public.portal_client_key(coalesce(nullif(d.data ->> 'clientName', ''), d.client_name)) = cp.client_key
         end
   where p_token is not null and length(p_token) >= 32
     and cp.token = p_token and cp.revoked_at is null
     and d.type in ('invoice', 'proposal')
     and (coalesce(d.data ->> 'status', 'draft') <> 'draft' or d.data ? 'approval')
$$;
revoke all on function public.portal_documents(text) from public, anon, authenticated;

-- Same customer-safe copy as before, minus the internal client id.
create or replace function public.public_document_data(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos' - 'clientId')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then (p_data -> 'approval') - 'token' else null end,
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;
