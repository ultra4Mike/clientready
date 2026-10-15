-- Client approval links.
-- A customer with the link (no login) can read a trimmed copy of ONE document and approve it.
-- Anon users still have no direct access to the documents table (RLS unchanged); they can only
-- call the two SECURITY DEFINER functions below, which match on the unguessable token.

create index if not exists documents_approval_token_idx
  on public.documents ((data -> 'approval' ->> 'token'))
  where data ? 'approval';

-- Read-only view of a document for its approval link. Never returns the token, owner costs,
-- crew, schedule or internal ids. Returns null for unknown/revoked tokens.
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
                    - 'changeOrderNotes' - 'updatedAt' - 'approval')
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

-- Approves the document behind the token. Only changes data.approval, only while pending.
-- Returns the new approval block (without the token), or null if the token is unknown,
-- revoked or already approved.
create or replace function public.approve_document(p_token text, p_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  update public.documents
     set data = jsonb_set(
           data, '{approval}',
           (data -> 'approval') || jsonb_build_object(
             'status', 'approved',
             'approvedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'approverName', left(btrim(coalesce(p_name, '')), 100)))
   where data -> 'approval' ->> 'token' = p_token
     and data -> 'approval' ->> 'status' = 'pending'
  returning (data -> 'approval') - 'token' into result;
  return result;
end;
$$;

revoke all on function public.get_document_by_approval_token(text) from public;
revoke all on function public.approve_document(text, text) from public;
grant execute on function public.get_document_by_approval_token(text) to anon, authenticated;
grant execute on function public.approve_document(text, text) to anon, authenticated;

-- An owner's save from a stale copy must not undo a customer's approval: if the stored approval
-- is approved and the incoming one has the same token but is not approved, keep the stored one.
create or replace function public.keep_document_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.data -> 'approval' ->> 'status' = 'approved'
     and new.data -> 'approval' ->> 'token' = old.data -> 'approval' ->> 'token'
     and coalesce(new.data -> 'approval' ->> 'status', '') <> 'approved' then
    new.data := jsonb_set(new.data, '{approval}', old.data -> 'approval');
  end if;
  return new;
end;
$$;

drop trigger if exists keep_document_approval on public.documents;
create trigger keep_document_approval
  before update on public.documents
  for each row execute function public.keep_document_approval();
