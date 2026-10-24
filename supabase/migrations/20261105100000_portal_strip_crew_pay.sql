-- deploy31: customer views (portal, approval link) drop crew pay / employee data that rode along on documents.
-- Re-runnable. The portal and approval RPCs already call public_document_data, so only this function changes.
create or replace function public.public_document_data(p_data jsonb)
returns jsonb language sql immutable as $$
  select (p_data - 'jobCosts' - 'crew' - 'recurring' - 'recurringReview' - 'recurringFrom'
                 - 'changeOrderNotes' - 'updatedAt' - 'approval' - 'schedule' - 'jobTime'
                 - 'reviews' - 'fromProposal' - 'changeOrderOf' - 'photos' - 'clientId' - 'emailLog'
                 - 'crewReport' - 'noLateFee' - 'visitNotes' - 'hoursApprovals' - 'jobMiles' - 'reviewAskedAt'
                 - 'history' - 'crewKindFix' - 'crewUndo' - 'stockUsed' - 'autoSent'
                 -- deploy31: change-order crew rows (name, pay rate, hours, bonus, paid, notes), prevailing-wage rate,
                 -- internal task type and job pin coordinates never reach customers.
                 - 'crewMoved' - 'crewMovedTo' - 'jobRate' - 'taskType' - 'pin' - 'lat' - 'lng' - 'crewKindFix')
         || jsonb_build_object(
              'approval', case when p_data ? 'approval' then public.public_approval_data(p_data -> 'approval') else null end,
              'history', public.public_history_data(p_data -> 'history'),
              'changeOrderOf', case when p_data ? 'changeOrderOf'
                                then jsonb_build_object('number', p_data -> 'changeOrderOf' -> 'number') else null end,
              'photos', case when p_data ->> 'showPhotos' = 'true' then coalesce(p_data -> 'photos', '[]'::jsonb) else '[]'::jsonb end)
$$;
revoke all on function public.public_document_data(jsonb) from public, anon, authenticated;
