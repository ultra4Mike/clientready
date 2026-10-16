-- Review request link (e.g. Google review page) on the owner's profile. Safe to re-run.
alter table public.profiles add column if not exists review_link text default '';
