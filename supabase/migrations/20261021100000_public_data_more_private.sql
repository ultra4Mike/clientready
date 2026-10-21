-- Keep newer owner-only fields out of customer links and the portal (re-runnable):
-- visitNotes (multi-visit notes), hoursApprovals (crew hours approvals), jobMiles (owner mileage),
-- reviewAskedAt (when the owner asked for a review). Raises if the approval function can't be patched (R45).
create or replace function public.public_document_data(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos' - 'clientId' - 'emailLog'
                 - 'crewReport' - 'noLateFee' - 'visitNotes' - 'hoursApprovals' - 'jobMiles' - 'reviewAskedAt')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then (p_data -> 'approval') - 'token' else null end,
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.get_document_by_approval_token(text)'::regprocedure);
  if position('reviewAskedAt' in def) > 0 then
    return; -- already done
  elsif position($k$- 'jobMiles'$k$ in def) > 0 then
    execute replace(def, $k$- 'jobMiles'$k$, $k$- 'jobMiles' - 'reviewAskedAt'$k$);
  elsif position($k$- 'noLateFee'$k$ in def) > 0 then
    execute replace(def, $k$- 'noLateFee'$k$, $k$- 'noLateFee' - 'visitNotes' - 'hoursApprovals' - 'jobMiles' - 'reviewAskedAt'$k$);
  else
    raise exception 'get_document_by_approval_token: expected hidden-key list not found; run 20261017110000 first';
  end if;
  def := pg_get_functiondef('public.get_document_by_approval_token(text)'::regprocedure);
  if position('reviewAskedAt' in def) = 0 then
    raise exception 'get_document_by_approval_token: owner-only keys were not added';
  end if;
end $$;
