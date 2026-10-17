-- Plan subscriptions (Stripe Billing). MUST BE RUN MANUALLY (SQL editor or `supabase db push`). Safe to re-run.
--
-- 1. profiles billing columns: plan ('trial' | 'monthly' | 'quarterly' | 'active' | 'owner'), subscription_status
--    (Stripe's status: active, trialing, past_due, canceled, unpaid, incomplete, ...), plan_period_end,
--    cancel_at_period_end, stripe_customer_id, stripe_subscription_id, subscription_event_at.
-- 2. Owners cannot change those columns themselves (a trigger keeps the old values for the
--    anon/authenticated roles); only the service role (the Stripe webhook) and the SQL editor can.
-- 3. stripe_subscription_events: one row per Stripe event id, so a redelivered event is applied once.
-- 4. apply_plan_subscription(...): service role only. Finds the owner (user id -> subscription id ->
--    customer id -> one auth user with that email), creates the profile row if missing, ignores stale or
--    old-subscription events, and records the event id. Returns 'applied' | 'duplicate' | 'unmatched' |
--    'stale' | 'ignored'.

alter table public.profiles add column if not exists plan text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists plan_period_end timestamptz;
alter table public.profiles add column if not exists cancel_at_period_end boolean not null default false;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_event_at timestamptz;
create index if not exists profiles_stripe_customer on public.profiles (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists profiles_stripe_subscription on public.profiles (stripe_subscription_id) where stripe_subscription_id is not null;

create or replace function public.profiles_guard_billing()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.plan in ('active', 'owner', 'monthly', 'quarterly') then new.plan := 'trial'; end if;
      new.subscription_status := null;
      new.plan_period_end := null;
      new.cancel_at_period_end := false;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.subscription_event_at := null;
    else
      new.plan := old.plan;
      new.subscription_status := old.subscription_status;
      new.plan_period_end := old.plan_period_end;
      new.cancel_at_period_end := old.cancel_at_period_end;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.subscription_event_at := old.subscription_event_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_billing on public.profiles;
create trigger profiles_guard_billing before insert or update on public.profiles
  for each row execute function public.profiles_guard_billing();

create table if not exists public.stripe_subscription_events (
  event_id text primary key,
  type text not null,
  user_id uuid,
  outcome text not null,
  subscription_id text,
  customer_id text,
  created_at timestamptz not null default now()
);
alter table public.stripe_subscription_events enable row level security;
revoke all on public.stripe_subscription_events from anon, authenticated;

create or replace function public.apply_plan_subscription(
  p_event_id text,
  p_type text,
  p_event_at timestamptz,
  p_user_id text default null,
  p_email text default null,
  p_customer text default null,
  p_subscription text default null,
  p_plan text default null,
  p_status text default null,
  p_period_end timestamptz default null,
  p_cancel_at_period_end boolean default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_prof public.profiles%rowtype;
  v_outcome text;
  v_live constant text[] := array['active', 'trialing', 'past_due'];
begin
  if coalesce(p_event_id, '') = '' then return 'invalid'; end if;
  if exists (select 1 from public.stripe_subscription_events where event_id = p_event_id) then return 'duplicate'; end if;
  if p_plan is not null and p_plan not in ('monthly', 'quarterly') then p_plan := null; end if;

  if coalesce(p_user_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_user from auth.users where id = p_user_id::uuid;
  end if;
  if v_user is null and coalesce(p_subscription, '') <> '' then
    select id into v_user from public.profiles where stripe_subscription_id = p_subscription limit 1;
  end if;
  if v_user is null and coalesce(p_customer, '') <> '' then
    select id into v_user from public.profiles where stripe_customer_id = p_customer limit 1;
  end if;
  if v_user is null and coalesce(p_email, '') <> '' and (select count(*) from auth.users where lower(email) = lower(trim(p_email))) = 1 then
    select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  end if;

  if v_user is null then
    v_outcome := 'unmatched';
  else
    insert into public.profiles (id) values (v_user) on conflict (id) do nothing;
    select * into v_prof from public.profiles where id = v_user for update;
    if v_prof.subscription_event_at is not null and p_event_at is not null and p_event_at < v_prof.subscription_event_at
       and coalesce(p_subscription, v_prof.stripe_subscription_id, '') = coalesce(v_prof.stripe_subscription_id, '') then
      v_outcome := 'stale';
    elsif coalesce(v_prof.stripe_subscription_id, '') <> '' and coalesce(p_subscription, '') <> '' and p_subscription <> v_prof.stripe_subscription_id
       and v_prof.subscription_status = any (v_live) and not (coalesce(p_status, '') = any (v_live)) then
      v_outcome := 'ignored';
    else
      update public.profiles set
        plan = case when plan = 'owner' then plan else coalesce(p_plan, case when plan in ('monthly', 'quarterly') then plan end, plan) end,
        subscription_status = coalesce(p_status, subscription_status),
        plan_period_end = coalesce(p_period_end, plan_period_end),
        cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
        stripe_customer_id = coalesce(nullif(p_customer, ''), stripe_customer_id),
        stripe_subscription_id = coalesce(nullif(p_subscription, ''), stripe_subscription_id),
        subscription_event_at = greatest(coalesce(p_event_at, subscription_event_at), coalesce(subscription_event_at, p_event_at))
      where id = v_user;
      v_outcome := 'applied';
    end if;
  end if;

  insert into public.stripe_subscription_events (event_id, type, user_id, outcome, subscription_id, customer_id)
  values (p_event_id, coalesce(p_type, ''), v_user, v_outcome, nullif(p_subscription, ''), nullif(p_customer, ''))
  on conflict (event_id) do nothing;
  return v_outcome;
end;
$$;

revoke all on function public.apply_plan_subscription(text, text, timestamptz, text, text, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_plan_subscription(text, text, timestamptz, text, text, text, text, text, text, timestamptz, boolean) to service_role';
    execute 'grant select, insert on public.stripe_subscription_events to service_role';
    execute 'grant select, update on public.profiles to service_role';
  end if;
end $$;
