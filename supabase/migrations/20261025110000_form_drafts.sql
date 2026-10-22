-- Autosave drafts (Help & Platform). Per auth user (owners and crew alike); owner-only RLS.
-- Idempotent: safe to run more than once. Ends with one row of true/false checks.
create table if not exists public.form_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  form_key text not null,
  record_id text not null default '',
  payload jsonb not null,
  version int not null default 1,
  device_id text,
  updated_at timestamptz default now(),
  unique (user_id, form_key, record_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'form_drafts_payload_size') then
    alter table public.form_drafts add constraint form_drafts_payload_size check (octet_length(payload::text) < 524288);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_drafts_key_len') then
    alter table public.form_drafts add constraint form_drafts_key_len check (length(form_key) between 1 and 100 and length(record_id) <= 200);
  end if;
end $$;

create index if not exists form_drafts_user_updated_idx on public.form_drafts (user_id, updated_at);

alter table public.form_drafts enable row level security;
drop policy if exists "A user can read their drafts" on public.form_drafts;
create policy "A user can read their drafts" on public.form_drafts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "A user can insert their drafts" on public.form_drafts;
create policy "A user can insert their drafts" on public.form_drafts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "A user can update their drafts" on public.form_drafts;
create policy "A user can update their drafts" on public.form_drafts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "A user can delete their drafts" on public.form_drafts;
create policy "A user can delete their drafts" on public.form_drafts for delete to authenticated using (auth.uid() = user_id);

-- Upsert with optimistic versioning. SECURITY INVOKER: RLS applies, so a caller only ever touches their own row.
-- conflict when the server copy is newer than the version the client last saw (p_base_version).
create or replace function public.put_form_draft(p_form_key text, p_record_id text, p_payload jsonb, p_base_version int, p_device_id text default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare cur public.form_drafts; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into cur from public.form_drafts where user_id = uid and form_key = p_form_key and record_id = coalesce(p_record_id, '') for update;
  if found then
    if cur.version > coalesce(p_base_version, 0) then
      return jsonb_build_object('status', 'conflict', 'version', cur.version, 'server_payload', cur.payload);
    end if;
    update public.form_drafts set payload = p_payload, version = cur.version + 1, device_id = p_device_id, updated_at = now()
      where id = cur.id;
    return jsonb_build_object('status', 'ok', 'version', cur.version + 1, 'server_payload', null);
  end if;
  insert into public.form_drafts (user_id, form_key, record_id, payload, version, device_id)
    values (uid, p_form_key, coalesce(p_record_id, ''), p_payload, 1, p_device_id)
    on conflict (user_id, form_key, record_id) do nothing;
  if not found then  -- lost a race with another device
    select * into cur from public.form_drafts where user_id = uid and form_key = p_form_key and record_id = coalesce(p_record_id, '');
    return jsonb_build_object('status', 'conflict', 'version', cur.version, 'server_payload', cur.payload);
  end if;
  return jsonb_build_object('status', 'ok', 'version', 1, 'server_payload', null);
end $$;
revoke all on function public.put_form_draft(text, text, jsonb, int, text) from public, anon;
grant execute on function public.put_form_draft(text, text, jsonb, int, text) to authenticated;

-- Cleanup: drafts untouched for 30 days. Not scheduled here. Run from pg_cron if enabled:
--   select cron.schedule('purge-form-drafts', '15 3 * * *', 'select public.purge_old_form_drafts()');
-- (the client also ignores drafts older than 30 days).
create or replace function public.purge_old_form_drafts(p_days int default 30)
returns int language sql security definer set search_path = public, pg_temp as $$
  with d as (delete from public.form_drafts where updated_at < now() - make_interval(days => greatest(p_days, 1)) returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.purge_old_form_drafts(int) from public, anon, authenticated;

select
  to_regclass('public.form_drafts') is not null as form_drafts_table,
  (select relrowsecurity from pg_class where oid = 'public.form_drafts'::regclass) as form_drafts_rls_on,
  (select count(*) = 4 from pg_policies where tablename = 'form_drafts' and coalesce(qual, with_check) like '%auth.uid() = user_id%') as form_drafts_owner_policies,
  exists (select 1 from pg_constraint where conname = 'form_drafts_payload_size') as payload_size_cap,
  exists (select 1 from pg_indexes where indexname = 'form_drafts_user_updated_idx') as user_updated_index,
  exists (select 1 from pg_proc where proname = 'put_form_draft' and not prosecdef and array_to_string(proconfig, ',') like '%search_path=%') as put_form_draft_fn,
  not has_function_privilege('anon', 'public.put_form_draft(text,text,jsonb,int,text)', 'execute') as put_draft_not_anon,
  exists (select 1 from pg_proc where proname = 'purge_old_form_drafts') as purge_fn,
  not has_function_privilege('authenticated', 'public.purge_old_form_drafts(int)', 'execute') as purge_not_callable_by_users;
