-- One generated recurring draft per schedule + period, so two devices opening the app at the same
-- time cannot both create it. Re-runnable. If duplicates already exist the index is skipped with a
-- notice (remove the extra drafts, then run this again).
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'documents_recurring_period_unique') then
    return;
  end if;
  if exists (
    select 1 from public.documents
    where data ? 'recurringFrom'
    group by user_id, data->'recurringFrom'->>'id', data->'recurringFrom'->>'period'
    having count(*) > 1 and data->'recurringFrom'->>'period' is not null
  ) then
    raise notice 'documents_recurring_period_unique not created: duplicate recurring drafts exist';
    return;
  end if;
  create unique index documents_recurring_period_unique
    on public.documents (user_id, (data->'recurringFrom'->>'id'), (data->'recurringFrom'->>'period'))
    where data ? 'recurringFrom' and data->'recurringFrom'->>'period' is not null;
end $$;
