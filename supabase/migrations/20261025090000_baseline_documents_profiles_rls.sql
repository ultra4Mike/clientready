-- Baseline: RLS + owner-only policies for documents and profiles.
-- For FRESH databases only. Prod already has its own owner-only policies (different names),
-- so each table's policies are created only when that table has NO policies yet. No-op on prod.
do $$
begin
  if to_regclass('public.documents') is not null and not exists (select 1 from pg_policies where schemaname='public' and tablename='documents') then
    execute 'alter table public.documents enable row level security';
    execute 'drop policy if exists "A user can read their documents" on public.documents';
    execute 'create policy "A user can read their documents" on public.documents for select to authenticated using (auth.uid() = user_id)';
    execute 'drop policy if exists "A user can insert their documents" on public.documents';
    execute 'create policy "A user can insert their documents" on public.documents for insert to authenticated with check (auth.uid() = user_id)';
    execute 'drop policy if exists "A user can update their documents" on public.documents';
    execute 'create policy "A user can update their documents" on public.documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'drop policy if exists "A user can delete their documents" on public.documents';
    execute 'create policy "A user can delete their documents" on public.documents for delete to authenticated using (auth.uid() = user_id)';
  end if;
  if to_regclass('public.profiles') is not null and not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles') then
    execute 'alter table public.profiles enable row level security';
    execute 'drop policy if exists "A user can read their profile" on public.profiles';
    execute 'create policy "A user can read their profile" on public.profiles for select to authenticated using (auth.uid() = id)';
    execute 'drop policy if exists "A user can insert their profile" on public.profiles';
    execute 'create policy "A user can insert their profile" on public.profiles for insert to authenticated with check (auth.uid() = id)';
    execute 'drop policy if exists "A user can update their profile" on public.profiles';
    execute 'create policy "A user can update their profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id)';
  end if;
end $$;
