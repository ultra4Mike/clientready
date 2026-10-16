-- clients.updated_at, set by the server on every update (used by the contact retry queue to skip
-- an older queued change when the cloud row is newer). Safe to re-run; skipped if there is no clients table.
do $$
begin
  if to_regclass('public.clients') is null then return; end if;
  alter table public.clients add column if not exists updated_at timestamptz not null default now();
end $$;

create or replace function public.clients_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
begin
  if to_regclass('public.clients') is null then return; end if;
  drop trigger if exists clients_touch_updated_at on public.clients;
  create trigger clients_touch_updated_at before update on public.clients
    for each row execute function public.clients_touch_updated_at();
end $$;
