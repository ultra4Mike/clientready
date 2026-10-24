-- QA2: a send the email provider refused gives its quota slot back (the newest slot this owner took in the last 10 minutes).
create or replace function public.email_quota_give_back()
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare victim tid;
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('email:' || auth.uid()::text));
  select ctid into victim from email_sends where owner_id = auth.uid() and sent_at > now() - interval '10 minutes' order by sent_at desc limit 1;
  if victim is null then return false; end if;
  delete from email_sends where ctid = victim;
  return true;
end $$;
revoke all on function public.email_quota_give_back() from public, anon;
grant execute on function public.email_quota_give_back() to authenticated;
