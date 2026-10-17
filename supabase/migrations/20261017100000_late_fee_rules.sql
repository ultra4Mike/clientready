-- Smart late fee rules (add-only, re-runnable): optional cap, minimum balance and repeat interval, stored
-- as {"max":"","minBalance":"","repeatDays":""}. Fees are still only suggested; the owner taps to add one.
alter table public.profiles add column if not exists late_fee_rules jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.profiles add constraint profiles_late_fee_rules_size check (pg_column_size(late_fee_rules) < 2000);
exception when duplicate_object then null; end $$;
