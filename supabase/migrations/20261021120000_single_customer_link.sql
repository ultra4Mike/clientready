-- Backlog 14: one customer link (the approval link, no account) to approve, see the visit, pay and sign.
-- 1) The visit (date/time/status only; never crew ids or notes) for a live approval link.
create or replace function public.get_visit_by_approval_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when d.data ? 'schedule' and coalesce(d.data -> 'schedule' ->> 'date', '') <> '' then
    jsonb_build_object(
      'date', d.data -> 'schedule' ->> 'date',
      'startTime', coalesce(d.data -> 'schedule' ->> 'startTime', ''),
      'endTime', coalesce(d.data -> 'schedule' ->> 'endTime', ''),
      'status', coalesce(d.data -> 'schedule' ->> 'status', 'scheduled'))
  else null end
  from public.documents d
  where p_token is not null and length(p_token) >= 32
    and d.data -> 'approval' ->> 'token' = p_token
  limit 1
$$;

-- 2) Approve with an optional drawn/typed signature (same checks as portal_approve).
create or replace function public.approve_document_signed(p_token text, p_name text default null, p_signature jsonb default null)
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
  if p_token is null or length(p_token) < 32 then return null; end if;
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
           (data -> 'approval') || jsonb_build_object(
             'status', 'approved',
             'approvedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'approverName', coalesce(nullif(nm, ''), sig ->> 'signerName', ''))
           || case when sig is not null then jsonb_build_object('signature', sig) else '{}'::jsonb end)
   where data -> 'approval' ->> 'token' = p_token
     and data -> 'approval' ->> 'status' = 'pending'
  returning (data -> 'approval') - 'token' into result;
  return result;
end;
$$;

revoke all on function public.get_visit_by_approval_token(text) from public;
revoke all on function public.approve_document_signed(text, text, jsonb) from public;
grant execute on function public.get_visit_by_approval_token(text) to anon, authenticated;
grant execute on function public.approve_document_signed(text, text, jsonb) to anon, authenticated;
