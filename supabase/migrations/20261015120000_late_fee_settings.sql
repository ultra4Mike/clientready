-- Late fee settings on the owner's profile (suggestion only; the app never adds a fee by itself). Safe to re-run.
-- Run after 20261015110000_on_my_way.sql.
alter table public.profiles add column if not exists late_fee_type text not null default 'off';
alter table public.profiles add column if not exists late_fee_value text not null default '';
alter table public.profiles add column if not exists late_fee_grace_days text not null default '0';
