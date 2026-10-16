-- Job packages (line-item templates) on the owner's profile so they follow the owner across devices.
-- Add-only and safe to re-run. Owner-only: covered by the existing profiles RLS (id = auth.uid()).
alter table public.profiles add column if not exists packages jsonb not null default '[]'::jsonb;
