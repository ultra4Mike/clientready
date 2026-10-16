-- R18: which invoice a crew job report was opened as, so opening it again goes to that invoice
-- instead of creating a second one with the same costs. Owner-only (existing job_drafts_owner policy). Add-only, re-runnable.
alter table public.job_drafts add column if not exists opened_doc_id text not null default '';
