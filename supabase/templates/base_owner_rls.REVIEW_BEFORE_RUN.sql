-- ============================================================================================
-- TEMPLATE — REVIEW BEFORE RUN. NOT A MIGRATION. NOT APPLIED AUTOMATICALLY.
-- Owner-only row-level security for documents, clients, profiles.
-- Kept outside supabase/migrations on purpose so `supabase db push` never runs it.
--
-- Before running:
--   1. Do the checks in rls-audit.md (step 2) and save the current policies somewhere.
--   2. Confirm the owner columns: documents.user_id, clients.user_id, profiles.id (= auth user id).
--   3. Crew users must NOT need direct table access to these tables (crew uses SECURITY DEFINER
--      functions). If any existing policy grants crew access, merge it in below instead of dropping it.
--   4. Run on a staging/branch project first, test log in + save + approval link + portal + crew.
-- To adopt: copy into supabase/migrations/<timestamp>_base_owner_rls.sql after review.
-- ============================================================================================

begin;

-- documents ---------------------------------------------------------------------------------
alter table public.documents enable row level security;
drop policy if exists documents_owner_select on public.documents;
drop policy if exists documents_owner_insert on public.documents;
drop policy if exists documents_owner_update on public.documents;
drop policy if exists documents_owner_delete on public.documents;
create policy documents_owner_select on public.documents for select to authenticated using (user_id = auth.uid());
create policy documents_owner_insert on public.documents for insert to authenticated with check (user_id = auth.uid());
create policy documents_owner_update on public.documents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy documents_owner_delete on public.documents for delete to authenticated using (user_id = auth.uid());

-- clients -----------------------------------------------------------------------------------
alter table public.clients enable row level security;
drop policy if exists clients_owner_select on public.clients;
drop policy if exists clients_owner_insert on public.clients;
drop policy if exists clients_owner_update on public.clients;
drop policy if exists clients_owner_delete on public.clients;
create policy clients_owner_select on public.clients for select to authenticated using (user_id = auth.uid());
create policy clients_owner_insert on public.clients for insert to authenticated with check (user_id = auth.uid());
create policy clients_owner_update on public.clients for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy clients_owner_delete on public.clients for delete to authenticated using (user_id = auth.uid());

-- profiles (one row per user, id = auth user id) --------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_owner_select on public.profiles;
drop policy if exists profiles_owner_insert on public.profiles;
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_owner_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_owner_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- No anonymous table access (approval links / portal use SECURITY DEFINER functions).
revoke all on public.documents, public.clients, public.profiles from anon;
grant select, insert, update, delete on public.documents, public.clients to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- Old policies with other names are NOT dropped here. After running, re-run rls-audit.md step 2
-- and remove any leftover permissive policy (especially anything with USING (true) or role anon).

commit;
