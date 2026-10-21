-- Overtime soft warning: weekly hours per worker (text like set_aside_percent; '' = default 40, '0' = off). Add-only.
alter table public.profiles add column if not exists overtime_hours text not null default '';
do $$ begin
  alter table public.profiles add constraint profiles_overtime_hours_len check (char_length(overtime_hours) <= 8);
exception when duplicate_object then null; end $$;
