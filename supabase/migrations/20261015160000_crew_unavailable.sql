-- Crew "unavailable" days. A crew member marks their own days off (for every owner who lists their
-- email); the owner sees them when scheduling. Crew never see anyone else's days. Safe to re-run.
create table if not exists public.crew_unavailable (
  owner_id uuid not null,
  employee_id text not null,
  worker_email text not null,
  day date not null,
  note text default '',
  created_at timestamptz not null default now(),
  primary key (owner_id, employee_id, day)
);
create index if not exists crew_unavailable_worker_idx on public.crew_unavailable (lower(worker_email), day);
alter table public.crew_unavailable enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'crew_unavailable' loop
    execute format('drop policy %I on public.crew_unavailable', pol.policyname);
  end loop;
end $$;

-- Owner: read and clear days for their own people. Crew: read only their own (writes via functions).
create policy crew_unavailable_owner_read on public.crew_unavailable for select to authenticated using (owner_id = auth.uid());
create policy crew_unavailable_owner_delete on public.crew_unavailable for delete to authenticated using (owner_id = auth.uid());
create policy crew_unavailable_worker_read on public.crew_unavailable for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
revoke all on public.crew_unavailable from anon;
grant select, delete on public.crew_unavailable to authenticated;

create or replace function public.crew_set_unavailable(p_day date, p_note text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if public.crew_email() = '' then raise exception 'Sign in first'; end if;
  if p_day is null or p_day < current_date - 1 then raise exception 'Pick today or a future day'; end if;
  insert into public.crew_unavailable (owner_id, employee_id, worker_email, day, note)
  select e.user_id, e.id, public.crew_email(), p_day, left(coalesce(p_note, ''), 200)
    from public.employees e
   where lower(coalesce(e.email, '')) = public.crew_email()
  on conflict (owner_id, employee_id, day) do update set note = excluded.note;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.crew_clear_unavailable(p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if public.crew_email() = '' then raise exception 'Sign in first'; end if;
  delete from public.crew_unavailable where lower(worker_email) = public.crew_email() and day = p_day;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.crew_set_unavailable(date, text) from public, anon;
revoke all on function public.crew_clear_unavailable(date) from public, anon;
grant execute on function public.crew_set_unavailable(date, text) to authenticated;
grant execute on function public.crew_clear_unavailable(date) to authenticated;
