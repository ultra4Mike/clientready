-- Preferred contact method per client ('' = no preference, 'email', 'text', 'call'). Owner-only via the
-- existing clients_owner policy. Add-only, re-runnable.
alter table public.clients add column if not exists preferred_contact text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_preferred_contact_check') then
    alter table public.clients add constraint clients_preferred_contact_check check (preferred_contact in ('', 'email', 'text', 'call'));
  end if;
end $$;
