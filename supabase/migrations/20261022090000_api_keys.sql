-- Backlog 15: optional API (off by default). Owner-created scoped keys; every call goes through api_call(),
-- which hashes the key, checks the account switch, scope, rate limit, and only touches that owner's rows.
-- Raw keys are shown once and never stored (sha256 only). Re-runnable.
alter table public.profiles add column if not exists api_enabled boolean not null default false;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  no_prices boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  window_start timestamptz not null default now(),
  window_count int not null default 0
);
create index if not exists api_keys_owner_idx on public.api_keys(owner_id);
alter table public.api_keys enable row level security;
drop policy if exists api_keys_owner_read on public.api_keys;
create policy api_keys_owner_read on public.api_keys for select to authenticated using (owner_id = auth.uid());
revoke all on public.api_keys from anon, authenticated;
grant select (id, name, prefix, scopes, no_prices, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;

create or replace function public.api_create_key(p_name text, p_scopes text[], p_no_prices boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare raw text; allowed text[] := array['clients:read','clients:write','jobs:read','jobs:write','invoices:read','invoices:write','notes:write'];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_scopes is null or cardinality(p_scopes) = 0 or not (p_scopes <@ allowed) then raise exception 'bad scopes'; end if;
  if p_no_prices and (p_scopes && array['invoices:read','invoices:write']) then raise exception 'worker keys cannot use invoices'; end if;
  if (select count(*) from api_keys where owner_id = auth.uid() and revoked_at is null) >= 10 then raise exception 'too many keys'; end if;
  raw := 'cr_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into api_keys(owner_id, name, prefix, key_hash, scopes, no_prices)
  values (auth.uid(), left(coalesce(p_name, ''), 60), left(raw, 11), encode(sha256(convert_to(raw, 'UTF8')), 'hex'), p_scopes, coalesce(p_no_prices, false));
  return raw;
end $$;

create or replace function public.api_revoke_key(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update api_keys set revoked_at = now() where id = p_id and owner_id = auth.uid() and revoked_at is null;
$$;

-- Job view without money for worker (no_prices) keys and for jobs in general (prices live on invoices).
create or replace function public.api_job_json(d documents, p_no_prices boolean)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'type', d.type, 'title', d.title, 'client_name', d.client_name,
    'address', d.data ->> 'clientAddress', 'schedule', d.data -> 'schedule', 'notes', d.data -> 'visitNotes')
  || case when p_no_prices then '{}'::jsonb else jsonb_build_object('status', coalesce(d.data ->> 'status', 'draft')) end;
$$;

create or replace function public.api_invoice_json(d documents)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'number', d.data ->> 'invoiceNumber', 'title', d.title, 'client_name', d.client_name,
    'client_email', d.data ->> 'clientEmail', 'status', coalesce(d.data ->> 'status', 'draft'), 'due_date', d.data ->> 'dueDate',
    'tax_percent', d.data ->> 'taxPercent', 'items', coalesce(d.data -> 'items', '[]'::jsonb), 'payments', coalesce(d.data -> 'payments', '[]'::jsonb),
    'notes', d.data ->> 'notes', 'created_at', d.created_at, 'updated_at', d.data ->> 'updatedAt');
$$;

create or replace function public.api_client_json(c clients)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'email', c.email, 'phone', c.phone,
    'address', c.address, 'notes', c.notes, 'updated_at', c.updated_at);
$$;

create or replace function public.api_call(p_key text, p_resource text, p_action text, p_id text default null, p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k api_keys; owner uuid; need text; d documents; c clients; out jsonb; body jsonb := coalesce(p_body, '{}'::jsonb);
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into k from api_keys where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') and revoked_at is null;
  if not found then return jsonb_build_object('status', 401, 'error', 'Invalid or revoked API key.'); end if;
  owner := k.owner_id;
  if not coalesce((select api_enabled from profiles where id = owner), false) then
    return jsonb_build_object('status', 403, 'error', 'The API is turned off for this account (Settings > Integrations).'); end if;
  -- 60 calls per minute per key.
  if k.window_start < now() - interval '1 minute' then
    update api_keys set window_start = now(), window_count = 1, last_used_at = now() where id = k.id;
  elsif k.window_count >= 60 then
    return jsonb_build_object('status', 429, 'error', 'Rate limit: 60 requests per minute per key.');
  else
    update api_keys set window_count = window_count + 1, last_used_at = now() where id = k.id;
  end if;

  need := case when p_resource = 'notes' then 'notes:write'
               when p_resource = 'events' then 'clients:read'
               else p_resource || case when p_action in ('list', 'get') then ':read' else ':write' end end;
  if p_resource = 'events' then
    if not (k.scopes && array['clients:read','jobs:read','invoices:read']) then return jsonb_build_object('status', 403, 'error', 'Key lacks a read scope.'); end if;
  elsif not (need = any(k.scopes)) then
    return jsonb_build_object('status', 403, 'error', 'Key lacks scope ' || need || '.');
  end if;

  if p_resource = 'clients' then
    if p_action = 'list' then
      select coalesce(jsonb_agg(api_client_json(x) order by x.updated_at desc), '[]') into out from (select * from clients where user_id = owner order by updated_at desc limit 200) x;
      return jsonb_build_object('status', 200, 'data', out);
    elsif p_action = 'get' then
      select * into c from clients where user_id = owner and id = p_id;
      if not found then return jsonb_build_object('status', 404, 'error', 'Not found.'); end if;
      return jsonb_build_object('status', 200, 'data', api_client_json(c));
    elsif p_action = 'create' then
      if coalesce(trim(body ->> 'name'), '') = '' then return jsonb_build_object('status', 400, 'error', 'name is required.'); end if;
      insert into clients(user_id, name, company, email, phone, address, notes)
      values (owner, left(body ->> 'name', 200), left(body ->> 'company', 200), left(body ->> 'email', 200), left(body ->> 'phone', 50), left(body ->> 'address', 500), left(body ->> 'notes', 5000))
      returning * into c;
      return jsonb_build_object('status', 201, 'data', api_client_json(c));
    elsif p_action = 'update' then
      update clients set name = coalesce(left(body ->> 'name', 200), name), company = coalesce(left(body ->> 'company', 200), company),
        email = coalesce(left(body ->> 'email', 200), email), phone = coalesce(left(body ->> 'phone', 50), phone),
        address = coalesce(left(body ->> 'address', 500), address), notes = coalesce(left(body ->> 'notes', 5000), notes), updated_at = now()
      where user_id = owner and id = p_id returning * into c;
      if not found then return jsonb_build_object('status', 404, 'error', 'Not found.'); end if;
      return jsonb_build_object('status', 200, 'data', api_client_json(c));
    end if;

  elsif p_resource = 'jobs' then
    if p_action = 'list' then
      select coalesce(jsonb_agg(api_job_json(x, k.no_prices)), '[]') into out from (select * from documents where user_id = owner and data ? 'schedule' order by data -> 'schedule' ->> 'date' desc nulls last limit 200) x;
      return jsonb_build_object('status', 200, 'data', out);
    end if;
    select * into d from documents where user_id = owner and id::text = p_id and data ? 'schedule';
    if not found then return jsonb_build_object('status', 404, 'error', 'Not found.'); end if;
    if p_action = 'get' then return jsonb_build_object('status', 200, 'data', api_job_json(d, k.no_prices)); end if;
    if p_action = 'update' then
      if body ? 'status' and not (body ->> 'status' in ('scheduled', 'in_progress', 'done')) then return jsonb_build_object('status', 400, 'error', 'status must be scheduled, in_progress or done.'); end if;
      if body ? 'date' and not (body ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$') then return jsonb_build_object('status', 400, 'error', 'date must be YYYY-MM-DD.'); end if;
      update documents set data = jsonb_set(data, '{schedule}', (data -> 'schedule')
          || jsonb_strip_nulls(jsonb_build_object('status', body ->> 'status', 'date', body ->> 'date',
               'startTime', case when body ->> 'start_time' ~ '^\d{2}:\d{2}$' then body ->> 'start_time' end,
               'confirmedAt', case when body ->> 'status' = 'done' then stamp end))
          || jsonb_build_object('updatedAt', stamp)) || jsonb_build_object('updatedAt', stamp)
      where id = d.id returning * into d;
      return jsonb_build_object('status', 200, 'data', api_job_json(d, k.no_prices));
    end if;

  elsif p_resource = 'notes' then
    -- Append a visit note to a job (owner-only field, never shown on customer links).
    if coalesce(trim(body ->> 'text'), '') = '' then return jsonb_build_object('status', 400, 'error', 'text is required.'); end if;
    update documents set data = data || jsonb_build_object('visitNotes', coalesce(data -> 'visitNotes', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'date', coalesce(body ->> 'date', to_char(now(), 'YYYY-MM-DD')), 'text', left(body ->> 'text', 2000))), 'updatedAt', stamp)
    where user_id = owner and id::text = p_id returning * into d;
    if not found then return jsonb_build_object('status', 404, 'error', 'Not found.'); end if;
    return jsonb_build_object('status', 201, 'data', jsonb_build_object('id', d.id, 'notes', d.data -> 'visitNotes'));

  elsif p_resource = 'invoices' then
    if p_action = 'list' then
      select coalesce(jsonb_agg(api_invoice_json(x)), '[]') into out from (select * from documents where user_id = owner and type = 'invoice' order by created_at desc limit 200) x;
      return jsonb_build_object('status', 200, 'data', out);
    elsif p_action = 'create' then
      if jsonb_typeof(body -> 'items') is distinct from 'array' or jsonb_array_length(body -> 'items') = 0 then return jsonb_build_object('status', 400, 'error', 'items (array of {description, qty, rate}) is required.'); end if;
      insert into documents(user_id, type, title, client_name, data)
      values (owner, 'invoice', left(coalesce(body ->> 'title', 'Invoice'), 200), left(body ->> 'client_name', 200),
        jsonb_strip_nulls(jsonb_build_object('status', 'draft', 'clientName', left(body ->> 'client_name', 200), 'clientEmail', left(body ->> 'client_email', 200),
          'dueDate', body ->> 'due_date', 'taxPercent', coalesce(body ->> 'tax_percent', '0'), 'notes', left(body ->> 'notes', 5000), 'updatedAt', stamp, 'source', 'api',
          'items', (select jsonb_agg(jsonb_build_object('description', left(i ->> 'description', 500), 'qty', coalesce(i ->> 'qty', '1'), 'rate', coalesce(i ->> 'rate', '0'))) from jsonb_array_elements(body -> 'items') i))))
      returning * into d;
      return jsonb_build_object('status', 201, 'data', api_invoice_json(d));
    end if;
    select * into d from documents where user_id = owner and type = 'invoice' and id::text = p_id;
    if not found then return jsonb_build_object('status', 404, 'error', 'Not found.'); end if;
    if p_action = 'get' then return jsonb_build_object('status', 200, 'data', api_invoice_json(d)); end if;
    if p_action = 'update' then
      -- Status and notes only; amounts and payments change in the app (keeps paid totals honest).
      if body ? 'status' and not (body ->> 'status' in ('draft', 'sent')) then return jsonb_build_object('status', 400, 'error', 'status can be draft or sent; record payments in the app.'); end if;
      update documents set data = data || jsonb_strip_nulls(jsonb_build_object('status', body ->> 'status', 'notes', left(body ->> 'notes', 5000),
          'dueDate', case when body ->> 'due_date' ~ '^\d{4}-\d{2}-\d{2}$' then body ->> 'due_date' end)) || jsonb_build_object('updatedAt', stamp)
      where id = d.id returning * into d;
      return jsonb_build_object('status', 200, 'data', api_invoice_json(d));
    end if;

  elsif p_resource = 'events' then
    -- Polling feed for Zapier/Make-style triggers: what changed since a time.
    select jsonb_build_object(
      'clients', case when 'clients:read' = any(k.scopes) then (select coalesce(jsonb_agg(api_client_json(x)), '[]') from (select * from clients where user_id = owner and updated_at > coalesce((body ->> 'since')::timestamptz, now() - interval '1 day') order by updated_at limit 100) x) end,
      'jobs', case when 'jobs:read' = any(k.scopes) then (select coalesce(jsonb_agg(api_job_json(x, k.no_prices)), '[]') from (select * from documents where user_id = owner and data ? 'schedule' and data ->> 'updatedAt' > coalesce(body ->> 'since', to_char((now() - interval '1 day') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')) limit 100) x) end,
      'invoices', case when 'invoices:read' = any(k.scopes) then (select coalesce(jsonb_agg(api_invoice_json(x)), '[]') from (select * from documents where user_id = owner and type = 'invoice' and data ->> 'updatedAt' > coalesce(body ->> 'since', to_char((now() - interval '1 day') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')) limit 100) x) end,
      'now', stamp) into out;
    return jsonb_build_object('status', 200, 'data', jsonb_strip_nulls(out));
  end if;
  return jsonb_build_object('status', 404, 'error', 'Unknown endpoint.');
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status', 400, 'error', 'Bad input.');
end $$;

revoke all on function public.api_create_key(text, text[], boolean) from public, anon;
revoke all on function public.api_revoke_key(uuid) from public, anon;
grant execute on function public.api_create_key(text, text[], boolean) to authenticated;
grant execute on function public.api_revoke_key(uuid) to authenticated;
revoke all on function public.api_job_json(documents, boolean) from public, anon, authenticated;
revoke all on function public.api_invoice_json(documents) from public, anon, authenticated;
revoke all on function public.api_client_json(clients) from public, anon, authenticated;
revoke all on function public.api_call(text, text, text, text, jsonb) from public, authenticated;
grant execute on function public.api_call(text, text, text, text, jsonb) to anon;
