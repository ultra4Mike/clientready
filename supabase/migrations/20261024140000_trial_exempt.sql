-- Developer trial exemption for exactly ONE account (the owner's own test login). Safe to re-run.
-- Run after 20261024130000_doc_numbers.sql.
-- 1. profiles.trial_exempt boolean default false.
-- 2. Users can never set it: a trigger keeps the old value for anon/authenticated (insert -> false).
--    Only SQL (postgres) or the service role can change it. There is no RPC or API that writes it.
-- 3. Partial unique index: at most one profile can ever be exempt.
-- An exempt profile is treated as fully active by every trial check (no banner, no lock, no checkout
-- prompt). Stripe billing for everyone else is untouched.
--
-- SET IT (SQL editor, as postgres). Replace the placeholder with the owner's login email:
--   update public.profiles set trial_exempt = true
--    where id = (select id from auth.users where lower(email) = lower('<<OWNER_LOGIN_EMAIL — Michael Henderson>>'));
-- UNSET:  update public.profiles set trial_exempt = false where trial_exempt;
-- CHECK:  select p.id, u.email, p.trial_exempt from public.profiles p join auth.users u on u.id = p.id where p.trial_exempt;
--         (0 or 1 row; a second "true" fails with a profiles_one_trial_exempt unique violation)

alter table public.profiles add column if not exists trial_exempt boolean not null default false;

create unique index if not exists profiles_one_trial_exempt on public.profiles ((true)) where trial_exempt;

create or replace function public.profiles_guard_trial_exempt()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.trial_exempt := false;
    else
      new.trial_exempt := old.trial_exempt;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_trial_exempt on public.profiles;
create trigger profiles_guard_trial_exempt before insert or update on public.profiles
  for each row execute function public.profiles_guard_trial_exempt();
