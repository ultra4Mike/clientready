-- Help & Platform: indexes for the per-owner and per-crew lookups that every RLS policy and list
-- screen runs (owner_id = auth.uid(), lower(worker_email) = crew_email(), user_id = auth.uid()).
-- Add-only, no data or policy change, re-runnable. Each index is skipped if its table/column is missing.
do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    ['documents',      'user_id',             'documents_user_id_idx',          '(user_id)'],
    ['clients',        'user_id',             'clients_user_id_idx',            '(user_id)'],
    ['crew_jobs',      'owner_id',            'crew_jobs_owner_idx',            '(owner_id)'],
    ['crew_jobs',      'worker_email',        'crew_jobs_worker_idx',           '(lower(worker_email))'],
    ['crew_expenses',  'owner_id',            'crew_expenses_owner_idx',        '(owner_id)'],
    ['crew_expenses',  'worker_email',        'crew_expenses_worker_idx',       '(lower(worker_email))'],
    ['job_drafts',     'owner_id',            'job_drafts_owner_idx',           '(owner_id)'],
    ['job_drafts',     'worker_email',        'job_drafts_worker_idx',          '(lower(worker_email))'],
    ['employees',      'email',               'employees_email_idx',            '(lower(email))'],
    ['push_subscriptions', 'user_id',         'push_subscriptions_user_idx',    '(user_id)']
  ] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = spec[1] and column_name = spec[2]) then
      execute format('create index if not exists %I on public.%I %s', spec[3], spec[1], spec[4]);
    end if;
  end loop;
end $$;

-- CHECK (expect one row per index above that applies, all exists = true):
-- select i.idx, to_regclass('public.' || i.idx) is not null as exists
-- from unnest(array['documents_user_id_idx','clients_user_id_idx','crew_jobs_owner_idx','crew_jobs_worker_idx',
--   'crew_expenses_owner_idx','crew_expenses_worker_idx','job_drafts_owner_idx','job_drafts_worker_idx',
--   'employees_email_idx','push_subscriptions_user_idx']) as i(idx);
