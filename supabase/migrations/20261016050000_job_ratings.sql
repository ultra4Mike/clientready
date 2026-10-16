-- Customer satisfaction rating (1-5 stars + optional comment) left from the approval link or client portal.
-- Kept in its own table so a rating never touches a document's data or money fields. Safe to re-run.
create table if not exists public.job_ratings (
  doc_id uuid primary key,
  owner_id uuid not null,
  stars int not null check (stars between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_ratings_owner_idx on public.job_ratings (owner_id);
alter table public.job_ratings enable row level security;
drop policy if exists job_ratings_owner_read on public.job_ratings;
create policy job_ratings_owner_read on public.job_ratings for select to authenticated using (owner_id = auth.uid());
revoke all on public.job_ratings from anon;
revoke insert, update, delete, truncate, trigger, references on public.job_ratings from authenticated;
grant select on public.job_ratings to authenticated;

-- Finds the invoice by approval token, or by portal token + document id (same rules as the portal), and saves the rating.
-- The customer can change their rating; only stars/comment/updated_at change.
create or replace function public.submit_job_rating(p_stars int, p_comment text default '', p_token text default null, p_portal text default null, p_doc_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid;
  v_owner uuid;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be 1-5';
  end if;
  if p_token is not null and length(p_token) >= 32 then
    select id, user_id into v_doc, v_owner from public.documents
     where data -> 'approval' ->> 'token' = p_token and type = 'invoice' limit 1;
  elsif p_portal is not null and p_doc_id is not null then
    select id, user_id into v_doc, v_owner from public.portal_documents(p_portal) where id = p_doc_id and type = 'invoice' limit 1;
  end if;
  if v_doc is null then
    return null;
  end if;
  insert into public.job_ratings (doc_id, owner_id, stars, comment)
  values (v_doc, v_owner, p_stars, left(coalesce(p_comment, ''), 1000))
  on conflict (doc_id) do update set stars = excluded.stars, comment = excluded.comment, updated_at = now();
  return jsonb_build_object('stars', p_stars, 'comment', left(coalesce(p_comment, ''), 1000));
end;
$$;
revoke all on function public.submit_job_rating(int, text, text, text, uuid) from public;
grant execute on function public.submit_job_rating(int, text, text, text, uuid) to anon, authenticated;

-- The customer's own rating for the same link (to show it back); null if none.
create or replace function public.get_job_rating(p_token text default null, p_portal text default null, p_doc_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doc uuid;
begin
  if p_token is not null and length(p_token) >= 32 then
    select id into v_doc from public.documents where data -> 'approval' ->> 'token' = p_token and type = 'invoice' limit 1;
  elsif p_portal is not null and p_doc_id is not null then
    select id into v_doc from public.portal_documents(p_portal) where id = p_doc_id and type = 'invoice' limit 1;
  end if;
  if v_doc is null then
    return null;
  end if;
  return (select jsonb_build_object('stars', stars, 'comment', comment) from public.job_ratings where doc_id = v_doc);
end;
$$;
revoke all on function public.get_job_rating(text, text, uuid) from public;
grant execute on function public.get_job_rating(text, text, uuid) to anon, authenticated;
