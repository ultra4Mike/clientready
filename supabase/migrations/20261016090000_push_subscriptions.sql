-- Web push subscriptions (one row per browser/device), owner-only. Add-only and re-runnable.
-- Sending pushes needs VAPID keys + a sender (not set up yet); until then rows are only stored.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid(),
  subscription jsonb not null,
  user_agent text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_owner on public.push_subscriptions;
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Account deletion also removes push subscriptions (same function as 20261016080000 plus one table).
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  counts jsonb := '{}'::jsonb;
  t record;
  n bigint;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  for t in
    select * from (values
      ('job_ratings', 'owner_id'), ('crew_job_photos', 'owner_id'), ('crew_clock', 'owner_id'),
      ('crew_expenses', 'owner_id'), ('crew_jobs', 'owner_id'), ('job_drafts', 'owner_id'),
      ('crew_unavailable', 'owner_id'), ('client_portals', 'owner_id'), ('document_tombstones', 'owner_id'),
      ('stripe_checkout_sessions', 'owner_id'), ('stripe_pending_payments', 'owner_id'),
      ('push_subscriptions', 'user_id'), ('employees', 'user_id'), ('clients', 'user_id'), ('documents', 'user_id'), ('profiles', 'id')
    ) as v(tbl, col)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('delete from public.%I where %I = $1', t.tbl, t.col) using uid;
      get diagnostics n = row_count;
      counts := counts || jsonb_build_object(t.tbl, n);
    end if;
  end loop;
  insert into public.account_deletions (user_hash) values (md5(uid::text || ':clientready'));
  return counts;
end;
$$;


revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
