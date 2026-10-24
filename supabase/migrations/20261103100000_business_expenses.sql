-- Business expenses (overhead not tied to a job) on the owner's profile, like profiles.mileage.
-- Add-only, safe to re-run; the existing profiles RLS (owner reads/updates only their own row) covers it.
alter table public.profiles add column if not exists business_expenses jsonb not null default '[]'::jsonb;
