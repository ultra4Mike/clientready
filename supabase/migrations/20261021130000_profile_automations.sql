-- Backlog 13: owner automation switches (all off by default). Add-only.
alter table public.profiles add column if not exists automations jsonb not null default '{}'::jsonb;
