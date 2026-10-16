-- In-app account deletion (store requirement). Add-only and re-runnable.
-- delete_my_account() removes every row the signed-in user owns, in one transaction, using auth.uid()
-- (never a user id from the caller). The auth user itself is removed afterwards by /api/account/delete
-- with the service role. Approval links and portals stop working because their rows are gone.
-- Stripe: pending checkout/payment rows are deleted too (Stripe keeps its own records); the owner's
-- Stripe account is not touched. Crew rows that only mention a worker's email belong to the owner and stay.

create table if not exists public.account_deletions (
  id bigserial primary key,
  user_hash text not null,
  deleted_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;

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
      ('employees', 'user_id'), ('clients', 'user_id'), ('documents', 'user_id'), ('profiles', 'id')
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
