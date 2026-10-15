-- Keep the owner's email log (data.emailLog: sentAt, to, subject) out of customer views. Safe to re-run.
-- Run after 20261015070000_portal_client_id.sql.
create or replace function public.public_document_data(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos' - 'clientId' - 'emailLog')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then (p_data -> 'approval') - 'token' else null end,
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;

-- Approval-link page: same function as before (20261015010000), also dropping emailLog and clientId.
create or replace function public.get_document_by_approval_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.documents%rowtype;
  p public.profiles%rowtype;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select * into d from public.documents
   where data -> 'approval' ->> 'token' = p_token
   limit 1;
  if not found then
    return null;
  end if;
  select * into p from public.profiles where id = d.user_id;
  return jsonb_build_object(
    'type', d.type,
    'title', d.title,
    'clientName', d.client_name,
    'data', (d.data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                    - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                    - 'emailLog' - 'clientId')
            || jsonb_build_object(
                 'approval', (d.data -> 'approval') - 'token',
                 'changeOrderOf', case when d.data ? 'changeOrderOf'
                                   then jsonb_build_object('number', d.data -> 'changeOrderOf' -> 'number')
                                   else null end),
    'business', jsonb_build_object(
      'name', coalesce(p.business_name, ''),
      'logo', coalesce(p.logo, ''),
      'paymentLink', coalesce(p.payment_link, ''),
      'email', coalesce(p.email, ''),
      'phone', coalesce(p.phone, ''))
  );
end;
$$;
