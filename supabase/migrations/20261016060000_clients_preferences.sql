-- Client preferences (contact method, gate code, pets, best times…), separate from free notes. Add-only, safe to re-run; skipped if there is no clients table.
do $$
begin
  if to_regclass('public.clients') is null then return; end if;
  alter table public.clients add column if not exists preferences text not null default '';
end $$;
