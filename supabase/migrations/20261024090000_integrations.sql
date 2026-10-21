-- Integrations: QuickBooks Online + Xero (one-way: ClientReady -> accounting; clients, invoices, payments).
-- Behind the NEXT_PUBLIC_FLAG_INTEGRATIONS flag and the provider app keys. Tokens are written and read only by
-- the server (service role): owners can see that they're connected and the last sync, never the tokens. Re-runnable.
create table if not exists public.integration_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('quickbooks', 'xero')),
  created_at timestamptz not null default now()
);
alter table public.integration_states enable row level security;
revoke all on public.integration_states from anon, authenticated;

create table if not exists public.integration_connections (
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('quickbooks', 'xero')),
  external_id text not null default '',
  external_name text not null default '',
  access_token text not null default '',
  refresh_token text not null default '',
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_result jsonb,
  primary key (owner_id, provider)
);
alter table public.integration_connections enable row level security;
drop policy if exists integration_connections_owner_read on public.integration_connections;
create policy integration_connections_owner_read on public.integration_connections for select to authenticated using (owner_id = auth.uid());
revoke all on public.integration_connections from anon, authenticated;
grant select (owner_id, provider, external_id, external_name, connected_at, last_sync_at, last_sync_result) on public.integration_connections to authenticated;

-- What was already sent (create-only sync: nothing is sent twice).
create table if not exists public.integration_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  kind text not null check (kind in ('client', 'invoice', 'payment')),
  local_id text not null,
  remote_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, provider, kind, local_id)
);
alter table public.integration_links enable row level security;
revoke all on public.integration_links from anon, authenticated;
grant all on public.integration_states, public.integration_connections, public.integration_links to service_role;
