-- R88: crew write a short visit note for a job they're assigned to. Safe to re-run.
-- Run after 20261024090000_integrations.sql.
-- Its own table: never touches documents, the schedule, the invoice, crew row times or any owner data.
create table if not exists public.crew_visit_notes (
  doc_id text not null,
  worker_email text not null,
  owner_id uuid not null,
  worker_name text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (doc_id, worker_email)
);
alter table public.crew_visit_notes enable row level security;
drop policy if exists "owner reads visit notes" on public.crew_visit_notes;
create policy "owner reads visit notes" on public.crew_visit_notes for select to authenticated using (owner_id = auth.uid());
drop policy if exists "crew reads own visit notes" on public.crew_visit_notes;
create policy "crew reads own visit notes" on public.crew_visit_notes for select to authenticated using (worker_email = lower(coalesce(auth.jwt() ->> 'email', '')));
revoke all on public.crew_visit_notes from anon;
grant select on public.crew_visit_notes to authenticated;

create or replace function public.crew_set_visit_note(p_doc_id text, p_note text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_owner uuid;
  v_name text;
begin
  if auth.uid() is null or v_email = '' then return false; end if;
  if length(coalesce(p_note, '')) > 2000 then raise exception 'note is too long (2000 characters max)' using errcode = 'P0001'; end if;
  select owner_id, coalesce(nullif(worker_name, ''), 'Crew') into v_owner, v_name from public.crew_jobs
   where doc_id = p_doc_id and left(id, length(p_doc_id) + 7) = p_doc_id || '-sched-' and lower(worker_email) = v_email
     -- Only an active employee of that owner (a removed or deactivated worker can't write notes).
     and exists (select 1 from public.employees e where e.user_id = crew_jobs.owner_id and lower(e.email) = v_email and coalesce(e.active, true))
   limit 1;
  if v_owner is null then return false; end if;
  insert into public.crew_visit_notes (doc_id, worker_email, owner_id, worker_name, note, updated_at)
  values (p_doc_id, v_email, v_owner, v_name, trim(coalesce(p_note, '')), now())
  on conflict (doc_id, worker_email) do update set note = excluded.note, worker_name = excluded.worker_name, updated_at = now();
  return true;
end;
$$;
revoke all on function public.crew_set_visit_note(text, text) from public, anon;
grant execute on function public.crew_set_visit_note(text, text) to authenticated;
