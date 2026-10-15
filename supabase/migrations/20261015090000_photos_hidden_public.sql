-- Customer views only get job photos when the owner turned on "show photos". Safe to re-run.
-- Run after 20261015080000_email_log_private.sql.
-- Portal RPCs already go through public_document_data (photos only when showPhotos is true); this
-- applies the same rule to the approval-link page. Stripe functions (service role only) are unchanged.
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
                    - 'emailLog' - 'clientId' - 'photos')
            || jsonb_build_object(
                 'approval', (d.data -> 'approval') - 'token',
                 'changeOrderOf', case when d.data ? 'changeOrderOf'
                                   then jsonb_build_object('number', d.data -> 'changeOrderOf' -> 'number')
                                   else null end,
                 'photos', case when d.data ->> 'showPhotos' = 'true'
                             then coalesce(d.data -> 'photos', '[]'::jsonb) else '[]'::jsonb end),
    'business', jsonb_build_object(
      'name', coalesce(p.business_name, ''),
      'logo', coalesce(p.logo, ''),
      'paymentLink', coalesce(p.payment_link, ''),
      'email', coalesce(p.email, ''),
      'phone', coalesce(p.phone, ''))
  );
end;
$$;
