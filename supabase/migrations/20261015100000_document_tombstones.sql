-- Deleted-document markers so a delete on one device is not undone by another device's sync. Safe to re-run.
-- Run after 20261015090000_photos_hidden_public.sql.
-- Owner-only (RLS). Holds only the document id and when it was deleted; no document content.
create table if not exists public.document_tombstones (
  owner_id uuid not null default auth.uid(),
  doc_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (owner_id, doc_id)
);
alter table public.document_tombstones enable row level security;
drop policy if exists document_tombstones_owner on public.document_tombstones;
create policy document_tombstones_owner on public.document_tombstones for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.document_tombstones from anon;
grant select, insert, update, delete on public.document_tombstones to authenticated;
