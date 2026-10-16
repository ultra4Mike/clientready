-- Owner mileage log on the profile so it follows the owner across devices. Add-only, safe to re-run; profiles RLS keeps it owner-only.
alter table public.profiles add column if not exists mileage jsonb not null default '[]'::jsonb;
