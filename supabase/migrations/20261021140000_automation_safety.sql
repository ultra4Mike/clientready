-- Help R46/R50/R51/R52. Re-runnable.
-- R46: one row per automated email (doc, kind, period). The server claims the row BEFORE sending, so two
-- devices or a reload can't send twice; a failed send releases it. Owners can read their rows (sync merge).
create table if not exists public.automation_sends (
  doc_id uuid not null references public.documents(id) on delete cascade,
  kind text not null check (kind in ('done', 'late')),
  period text not null,
  owner_id uuid not null,
  claimed_at timestamptz not null default now(),
  primary key (doc_id, kind, period)
);
alter table public.automation_sends enable row level security;
drop policy if exists automation_sends_owner_read on public.automation_sends;
create policy automation_sends_owner_read on public.automation_sends for select to authenticated using (owner_id = auth.uid());
revoke all on public.automation_sends from anon, authenticated;
grant select on public.automation_sends to authenticated;

create or replace function public.claim_automation_send(p_doc uuid, p_kind text, p_period text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  if not exists (select 1 from documents where id = p_doc and user_id = auth.uid()) then return false; end if;
  insert into automation_sends(doc_id, kind, period, owner_id) values (p_doc, p_kind, left(p_period, 40), auth.uid())
  on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.release_automation_send(p_doc uuid, p_kind text, p_period text)
returns void language sql volatile security definer set search_path = public as $$
  delete from automation_sends where doc_id = p_doc and kind = p_kind and period = p_period and owner_id = auth.uid();
$$;

-- R50: per-owner email limits (10 a minute, 100 a day), counted on the server before each send.
create table if not exists public.email_sends (
  owner_id uuid not null,
  sent_at timestamptz not null default now()
);
create index if not exists email_sends_owner_idx on public.email_sends(owner_id, sent_at);
alter table public.email_sends enable row level security;
revoke all on public.email_sends from anon, authenticated;

create or replace function public.email_quota_take()
returns text language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'auth'; end if;
  perform pg_advisory_xact_lock(hashtext('email:' || auth.uid()::text));
  if (select count(*) from email_sends where owner_id = auth.uid() and sent_at > now() - interval '1 minute') >= 10 then return 'minute'; end if;
  if (select count(*) from email_sends where owner_id = auth.uid() and sent_at > now() - interval '1 day') >= 100 then return 'day'; end if;
  insert into email_sends(owner_id) values (auth.uid());
  delete from email_sends where owner_id = auth.uid() and sent_at < now() - interval '2 days';
  return '';
end $$;

-- R51: client opt-out of automatic emails.
alter table public.clients add column if not exists auto_email_opt_out boolean not null default false;

-- R52: rate limit the customer-link functions (30 calls a minute per link, 600 a minute overall).
create table if not exists public.approval_hits (
  minute timestamptz not null,
  key text not null,
  n int not null default 0,
  primary key (minute, key)
);
alter table public.approval_hits enable row level security;
revoke all on public.approval_hits from anon, authenticated;

create or replace function public.approval_rate_check(p_token text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare m timestamptz := date_trunc('minute', now()); a int; t int;
begin
  insert into approval_hits values (m, 'all', 1) on conflict (minute, key) do update set n = approval_hits.n + 1 returning n into a;
  insert into approval_hits values (m, md5(coalesce(p_token, '')), 1) on conflict (minute, key) do update set n = approval_hits.n + 1 returning n into t;
  if random() < 0.01 then delete from approval_hits where minute < now() - interval '1 hour'; end if;
  if a > 600 or t > 30 then raise exception 'Too many requests. Try again in a minute.' using errcode = 'P0429'; end if;
end $$;
revoke all on function public.approval_rate_check(text) from public, anon, authenticated;

do $$
declare f text; def text;
begin
  foreach f in array array['get_document_by_approval_token(text)', 'approve_document(text,text)', 'approve_document_signed(text,text,jsonb)', 'portal_approve(text,uuid,text,jsonb)', 'get_client_portal(text)'] loop
    def := pg_get_functiondef(('public.' || f)::regprocedure);
    if def like '%approval_rate_check%' then continue; end if;
    if def !~* '\mbegin\M' then raise exception 'R52: could not patch %', f; end if;
    def := regexp_replace(def, '\mbegin\M', 'begin perform public.approval_rate_check(p_token);', 'i');
    def := regexp_replace(def, '\m(STABLE|IMMUTABLE)\M', 'VOLATILE', 'i');
    execute def;
  end loop;
end $$;

create or replace function public.get_visit_by_approval_token(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare out jsonb;
begin
  perform public.approval_rate_check(p_token);
  select case when d.data ? 'schedule' and coalesce(d.data -> 'schedule' ->> 'date', '') <> '' then
    jsonb_build_object('date', d.data -> 'schedule' ->> 'date', 'startTime', coalesce(d.data -> 'schedule' ->> 'startTime', ''),
      'endTime', coalesce(d.data -> 'schedule' ->> 'endTime', ''), 'status', coalesce(d.data -> 'schedule' ->> 'status', 'scheduled'))
  else null end into out
  from public.documents d
  where p_token is not null and length(p_token) >= 32 and d.data -> 'approval' ->> 'token' = p_token
  limit 1;
  return out;
end $$;
revoke all on function public.get_visit_by_approval_token(text) from public;
grant execute on function public.get_visit_by_approval_token(text) to anon, authenticated;

revoke all on function public.claim_automation_send(uuid, text, text) from public, anon;
revoke all on function public.release_automation_send(uuid, text, text) from public, anon;
revoke all on function public.email_quota_take() from public, anon;
grant execute on function public.claim_automation_send(uuid, text, text) to authenticated;
grant execute on function public.release_automation_send(uuid, text, text) to authenticated;
grant execute on function public.email_quota_take() to authenticated;
