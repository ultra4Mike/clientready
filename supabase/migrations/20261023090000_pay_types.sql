-- Per-employee pay types + overtime options (owner sets them on Team).
-- Default '{}' = hourly, overtime off: existing pay does not change.
-- Shape: {"type":"hourly"|"day"|"job","dayHours":"8","dayRate":"","jobAmount":"","overtime":{"on":false,"weekly":"40","daily":"","multiplier":"1.5"}}
alter table public.employees add column if not exists pay_settings jsonb not null default '{}'::jsonb;
-- The amounts used on a job are copied onto that job's crew row (documents.data.crew[].payType/fixedPay/payOverride),
-- so changing someone's pay type later never changes past jobs. Workers only read their own employees row (existing RLS).
