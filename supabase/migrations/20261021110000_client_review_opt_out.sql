-- R32: a client can opt out of review requests (owner ticks it on the client). Add-only.
alter table public.clients add column if not exists review_opt_out boolean not null default false;
