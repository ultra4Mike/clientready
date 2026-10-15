-- Crew isolation, clock in/out and crew expenses.
-- Run after 20261015010000_job_scheduling.sql.
--
-- Each crew member (signed in with their own account, matched to an employee by email) can read
-- only their own rows; owners read/write their own. Crew never write tables directly except
-- their own job reports: everything else goes through SECURITY DEFINER functions that check the
-- caller is assigned to the job.

create or replace function public.crew_email()
returns text
language sql
stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Clock entries: one row per stretch of work. Several per worker per job are allowed.
create table if not exists public.crew_clock (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  doc_id text not null,
  employee_id text not null default '',
  worker_email text not null,
  worker_name text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  edited_reason text,
  edited_at timestamptz,
  edited_by text,
  created_at timestamptz not null default now(),
  constraint crew_clock_order check (ended_at is null or ended_at > started_at)
);
create index if not exists crew_clock_owner_doc_idx on public.crew_clock (owner_id, doc_id);
create index if not exists crew_clock_worker_idx on public.crew_clock (lower(worker_email));
-- At most one running clock per worker.
create unique index if not exists crew_clock_one_open on public.crew_clock (lower(worker_email)) where ended_at is null;

alter table if exists public.crew_expenses add column if not exists employee_id text default '';
alter table if exists public.crew_expenses add column if not exists created_at timestamptz default now();

-- Repair row-level security: drop whatever policies exist on these tables and define them here.
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['crew_jobs', 'crew_expenses', 'job_drafts', 'employees', 'crew_clock'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- crew_jobs: owner manages their own; crew read only rows addressed to their email.
create policy crew_jobs_owner on public.crew_jobs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_jobs_worker_read on public.crew_jobs for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());

-- crew_expenses: owner reads/edits/deletes theirs; crew read only their own (inserts via crew_add_expense).
create policy crew_expenses_owner on public.crew_expenses for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_expenses_worker_read on public.crew_expenses for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());

-- job_drafts (crew job reports): owner manages theirs; crew read and add their own, only for an
-- owner who has them on the employee list.
create policy job_drafts_owner on public.job_drafts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy job_drafts_worker_read on public.job_drafts for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());
create policy job_drafts_worker_insert on public.job_drafts for insert to authenticated
  with check (
    public.crew_email() <> ''
    and lower(worker_email) = public.crew_email()
    and exists (select 1 from public.employees e where e.user_id = job_drafts.owner_id and lower(e.email) = public.crew_email())
  );

-- employees: owner manages theirs; a crew member can read only their own employee record.
create policy employees_owner on public.employees for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy employees_self_read on public.employees for select to authenticated
  using (public.crew_email() <> '' and lower(email) = public.crew_email());

-- crew_clock: owner reads and corrects theirs; crew read only their own (writes via functions).
create policy crew_clock_owner on public.crew_clock for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy crew_clock_worker_read on public.crew_clock for select to authenticated
  using (public.crew_email() <> '' and lower(worker_email) = public.crew_email());

grant select, insert, update, delete on public.crew_clock to authenticated;

-- The owner and employee id for the caller on a job they are assigned to (any crew_jobs row).
create or replace function public.crew_assignment(p_doc_id text)
returns table (owner_id uuid, employee_id text, worker_name text)
language sql
stable
security definer
set search_path = public
as $$
  select j.owner_id, coalesce(j.employee_id, ''), coalesce(j.worker_name, '')
    from public.crew_jobs j
   where j.doc_id = p_doc_id
     and public.crew_email() <> ''
     and lower(j.worker_email) = public.crew_email()
   order by (j.id like p_doc_id || '-sched-%') desc
   limit 1
$$;
revoke all on function public.crew_assignment(text) from public, anon;

create or replace function public.crew_clock_in(p_doc_id text)
returns public.crew_clock
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a record;
  result public.crew_clock;
begin
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  if exists (select 1 from public.crew_clock where lower(worker_email) = public.crew_email() and ended_at is null) then
    raise exception 'already clocked in' using errcode = 'P0001';
  end if;
  insert into public.crew_clock (owner_id, doc_id, employee_id, worker_email, worker_name)
  values (a.owner_id, p_doc_id, a.employee_id, public.crew_email(), a.worker_name)
  returning * into result;
  return result;
end;
$$;

create or replace function public.crew_clock_out(p_doc_id text)
returns public.crew_clock
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  result public.crew_clock;
begin
  update public.crew_clock
     set ended_at = greatest(now(), started_at + interval '1 second')
   where doc_id = p_doc_id
     and lower(worker_email) = public.crew_email()
     and ended_at is null
  returning * into result;
  if result.id is null then
    raise exception 'not clocked in on this job' using errcode = 'P0001';
  end if;
  return result;
end;
$$;

-- Forgot to clock out (or in): a worker may correct their own entry, with a reason the owner sees.
create or replace function public.crew_edit_clock(p_id uuid, p_started timestamptz, p_ended timestamptz, p_reason text)
returns public.crew_clock
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  result public.crew_clock;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = 'P0001';
  end if;
  if p_ended is null or p_started is null or p_ended <= p_started or p_ended - p_started > interval '24 hours' or p_ended > now() + interval '5 minutes' then
    raise exception 'times are not valid' using errcode = 'P0001';
  end if;
  update public.crew_clock
     set started_at = p_started, ended_at = p_ended,
         edited_reason = left(btrim(p_reason), 200), edited_at = now(), edited_by = public.crew_email()
   where id = p_id
     and lower(worker_email) = public.crew_email()
  returning * into result;
  if result.id is null then
    raise exception 'entry not found' using errcode = '42501';
  end if;
  return result;
end;
$$;

-- Expense on a job the caller is assigned to. Receipts are stored inline (compressed JPEG data URL).
create or replace function public.crew_add_expense(p_doc_id text, p_kind text, p_amount text, p_note text, p_receipt text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a record;
  v_amount numeric;
begin
  select * into a from public.crew_assignment(p_doc_id);
  if a.owner_id is null then
    raise exception 'not assigned to this job' using errcode = '42501';
  end if;
  begin
    v_amount := nullif(regexp_replace(coalesce(p_amount, ''), '[^0-9.]', '', 'g'), '')::numeric;
  exception when others then
    v_amount := null;
  end;
  if v_amount is null or v_amount <= 0 or v_amount > 100000 then
    raise exception 'amount is not valid' using errcode = 'P0001';
  end if;
  if p_kind not in ('gas', 'parts', 'dump', 'other') then
    raise exception 'category is not valid' using errcode = 'P0001';
  end if;
  if length(coalesce(p_receipt, '')) > 3000000 or (coalesce(p_receipt, '') <> '' and p_receipt not like 'data:image/%') then
    raise exception 'receipt is not valid' using errcode = 'P0001';
  end if;
  insert into public.crew_expenses (id, owner_id, doc_id, worker_email, worker_name, employee_id, kind, amount, note, receipt)
  values (gen_random_uuid()::text, a.owner_id, p_doc_id, public.crew_email(), a.worker_name, a.employee_id,
          p_kind, to_char(v_amount, 'FM999999990.00'), left(coalesce(p_note, ''), 300), coalesce(p_receipt, ''));
  return true;
end;
$$;

revoke all on function public.crew_clock_in(text) from public, anon;
revoke all on function public.crew_clock_out(text) from public, anon;
revoke all on function public.crew_edit_clock(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.crew_add_expense(text, text, text, text, text) from public, anon;
grant execute on function public.crew_clock_in(text) to authenticated;
grant execute on function public.crew_clock_out(text) to authenticated;
grant execute on function public.crew_edit_clock(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.crew_add_expense(text, text, text, text, text) to authenticated;
grant execute on function public.crew_email() to authenticated;
