-- Help/Platform speed audit 2026-10-21: indexes for the per-load reads every owner/crew page makes.
-- Idempotent (create index if not exists); no data changes. Gains are small at today's row counts and
-- grow with account size (RLS filters on owner_id / user_id / lower(worker_email) otherwise seq-scan).
create index if not exists documents_user_created_idx on public.documents (user_id, created_at desc);
create index if not exists clients_user_idx on public.clients (user_id);
create index if not exists crew_jobs_owner_idx on public.crew_jobs (owner_id);
create index if not exists crew_jobs_worker_date_idx on public.crew_jobs (lower(worker_email), job_date);
create index if not exists crew_expenses_owner_idx on public.crew_expenses (owner_id);
create index if not exists crew_expenses_worker_idx on public.crew_expenses (lower(worker_email), created_at desc);
create index if not exists job_drafts_owner_idx on public.job_drafts (owner_id);
create index if not exists job_drafts_worker_idx on public.job_drafts (lower(worker_email), created_at desc);
create index if not exists employees_email_idx on public.employees (lower(email));

-- Verification (expect 9 rows, all true):
-- select i.idx, exists (select 1 from pg_indexes p where p.schemaname = 'public' and p.indexname = i.idx) as present
-- from unnest(array['documents_user_created_idx','clients_user_idx','crew_jobs_owner_idx','crew_jobs_worker_date_idx',
--   'crew_expenses_owner_idx','crew_expenses_worker_idx','job_drafts_owner_idx','job_drafts_worker_idx','employees_email_idx']) as i(idx);
