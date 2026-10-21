-- R94: a saved crew email never becomes an owner account. Safe to re-run.
-- Run after 20261024100000_crew_visit_notes.sql.
-- 1. is_crew_email() is always replaced (older projects kept their own version) and matches lower/trim,
--    so '+' addresses and stray spaces/case can't miss.
-- 2. crew_signup_check(email): anon-safe yes/no BEFORE sign-up (returns only a boolean, no names or owners).
-- 3. profiles insert for a saved crew email is refused (no owner profile/trial), in the DB, whoever inserts.
-- 4. crew_fix_owner_profile(): recovery. A crew login that already got an empty owner profile is flagged
--    (crew_account = true) and that empty profile row is removed. A profile with any data is only flagged.
create or replace function public.is_crew_email()
returns table(id text, user_id uuid)
language sql stable security definer set search_path = public
as $$
  select e.id, e.user_id from public.employees e
   where lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> ''
     and lower(trim(coalesce(e.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
     and coalesce(e.active, true)
     and e.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
   limit 1
$$;
revoke all on function public.is_crew_email() from public, anon;
grant execute on function public.is_crew_email() to authenticated;

create or replace function public.crew_signup_check(p_email text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.employees e
    where lower(trim(coalesce(p_email, ''))) <> ''
      and lower(trim(coalesce(e.email, ''))) = lower(trim(p_email))
      and coalesce(e.active, true))
$$;
revoke all on function public.crew_signup_check(text) from public;
grant execute on function public.crew_signup_check(text) to anon, authenticated;

alter table public.profiles add column if not exists crew_account boolean not null default false;

create or replace function public.profiles_block_crew()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_email text;
begin
  select lower(trim(coalesce(email, ''))) into v_email from auth.users where id = new.id;
  if v_email <> '' and exists (select 1 from public.employees e
       where lower(trim(coalesce(e.email, ''))) = v_email and coalesce(e.active, true) and e.user_id <> new.id) then
    raise exception 'this email is a crew login; open /crew' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_block_crew on public.profiles;
create trigger profiles_block_crew before insert on public.profiles for each row execute function public.profiles_block_crew();

create or replace function public.crew_fix_owner_profile()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_has_data boolean;
begin
  if v_uid is null or not exists (select 1 from public.is_crew_email()) then return 'not_crew'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then return 'ok'; end if;
  v_has_data := exists (select 1 from public.documents where user_id = v_uid)
             or exists (select 1 from public.clients where user_id = v_uid)
             or exists (select 1 from public.employees where user_id = v_uid);
  if v_has_data then
    update public.profiles set crew_account = true where id = v_uid;
    return 'flagged';
  end if;
  delete from public.profiles where id = v_uid;
  return 'removed';
end;
$$;
revoke all on function public.crew_fix_owner_profile() from public, anon;
grant execute on function public.crew_fix_owner_profile() to authenticated;
