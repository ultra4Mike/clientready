-- B1 (live): crew schedule rows written without the worker's email were invisible in the crew app
-- (crew read rows addressed to their login email). Fill them from the team list. Idempotent; touches only
-- crew_jobs.worker_email where it is empty and the team list has an email.
update public.crew_jobs cj set worker_email = lower(e.email)
  from public.employees e
 where e.user_id = cj.owner_id and e.id = cj.employee_id
   and coalesce(cj.worker_email, '') = '' and coalesce(e.email, '') <> '';
