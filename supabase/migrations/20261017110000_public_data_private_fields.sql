-- Keep owner-only fields out of customer links and the portal (re-runnable): crewReport (crew cost lines
-- from 8ba24f3-era reports) and noLateFee were added to documents.data after 20261015080000.
-- Same function as 20261015080000 plus those two keys.
create or replace function public.public_document_data(p_data jsonb)
returns jsonb
language sql
immutable
as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos' - 'clientId' - 'emailLog'
                 - 'crewReport' - 'noLateFee')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then (p_data -> 'approval') - 'token' else null end,
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;

-- The approval-link function (latest version 20261015090000) lists the hidden keys inline: add the same
-- two keys to the live definition, leaving everything else in it unchanged. Skipped if already done.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.get_document_by_approval_token(text)'::regprocedure);
  if position('crewReport' in def) = 0 and position($k$- 'photos')$k$ in def) > 0 then
    execute replace(def, $k$- 'photos')$k$, $k$- 'photos' - 'crewReport' - 'noLateFee')$k$);
  end if;
end $$;
