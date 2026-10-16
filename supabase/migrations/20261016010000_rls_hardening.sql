-- RLS hardening for the base tables (documents, clients, profiles). MUST BE RUN MANUALLY. Safe to re-run.
--
-- Live audit (2026-10-16) found: owner policies granted TO public (anon included), UPDATE policies
-- without WITH CHECK, full table grants (incl. TRUNCATE) to anon and authenticated, and anon EXECUTE
-- on the SECURITY DEFINER crew helpers is_crew_email() / list_crew_clients().
--
-- This migration keeps every existing policy name and condition, and only:
--   1. moves policies on the 3 tables that apply to PUBLIC (or anon) to TO authenticated;
--   2. adds WITH CHECK (same expression as USING) to UPDATE / ALL policies that have none;
--   3. revokes all table privileges on the 3 tables from anon;
--   4. revokes TRUNCATE, TRIGGER, REFERENCES on the 3 tables from authenticated;
--   5. revokes EXECUTE on is_crew_email() / list_crew_clients() from anon and PUBLIC (the app only calls
--      them after sign-in).
-- Approval links and the client portal are unaffected: they use their own SECURITY DEFINER functions
-- (get_document_by_approval_token, approve_document, get_client_portal, get_portal_document,
-- portal_approve), which keep their anon EXECUTE grants.

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public' and tablename in ('documents', 'clients', 'profiles')
  loop
    if p.roles && array['public', 'anon']::name[] then
      execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
    end if;
    if p.cmd in ('UPDATE', 'ALL') and p.with_check is null and p.qual is not null then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, p.qual);
    end if;
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['documents', 'clients', 'profiles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);
      execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.is_crew_email()') is not null then
    revoke execute on function public.is_crew_email() from public, anon;
    grant execute on function public.is_crew_email() to authenticated;
  end if;
  if to_regprocedure('public.list_crew_clients()') is not null then
    revoke execute on function public.list_crew_clients() from public, anon;
    grant execute on function public.list_crew_clients() to authenticated;
  end if;
end $$;
