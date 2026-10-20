-- Set-aside % and profit alert minimum margin saved to the account (add-only, re-runnable).
-- set_aside_percent already exists on live (original column the app never wrote, so sync reset it to 30%);
-- its add is a no-op there. '' / null = not set (the app uses 30 and 20).
alter table public.profiles add column if not exists set_aside_percent text not null default '';
alter table public.profiles add column if not exists profit_alert_margin text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_money_settings_len check (char_length(set_aside_percent) <= 8 and char_length(profit_alert_margin) <= 8);
exception when duplicate_object then null; end $$;
