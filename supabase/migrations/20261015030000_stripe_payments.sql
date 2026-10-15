-- Stripe Checkout payments. Safe to re-run.
-- Run after 20261015000000_approval_links.sql.
--
-- Two functions that ONLY the server (service role key) can call:
--   stripe_invoice_for_token: finds the invoice behind an approval link, so the server can
--     compute what is still owed (the browser never sends an amount).
--   record_stripe_payment: appends a verified Stripe payment to the invoice's payments list,
--     once per Checkout session. It does not change the invoice status.

create or replace function public.stripe_invoice_for_token(p_token text)
returns table (id uuid, type text, title text, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.type, d.title, d.data
    from public.documents d
   where p_token is not null
     and length(p_token) >= 32
     and d.data -> 'approval' ->> 'token' = p_token
   limit 1
$$;

create or replace function public.record_stripe_payment(
  p_doc_id uuid,
  p_session_id text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_ref text default ''
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_data jsonb;
  v_payments jsonb;
  v_id text := 'stripe_' || coalesce(p_session_id, '');
  v_new jsonb;
  v_total numeric;
begin
  if p_session_id is null or length(p_session_id) < 3 or p_amount is null or p_amount <= 0 then
    return false;
  end if;
  select d.data into v_data from public.documents d where d.id = p_doc_id and d.type = 'invoice' for update;
  if not found then
    return false;
  end if;
  v_data := coalesce(v_data, '{}'::jsonb);
  if jsonb_typeof(v_data -> 'payments') = 'array' then
    v_payments := v_data -> 'payments';
  elsif coalesce(nullif(regexp_replace(coalesce(v_data ->> 'paymentAmount', ''), '[^0-9.]', '', 'g'), ''), '0')::numeric > 0 then
    -- Older invoice with a single payment: keep it as the first entry.
    v_payments := jsonb_build_array(jsonb_build_object(
      'id', 'legacy', 'amount', v_data ->> 'paymentAmount', 'method', coalesce(v_data ->> 'paymentMethod', ''),
      'date', coalesce(v_data ->> 'paymentDate', ''), 'ref', coalesce(v_data ->> 'paymentRef', '')));
  else
    v_payments := '[]'::jsonb;
  end if;
  -- Idempotent: Stripe may deliver the same event more than once.
  if exists (select 1 from jsonb_array_elements(v_payments) e where e ->> 'id' = v_id) then
    return true;
  end if;
  v_new := jsonb_build_object(
    'id', v_id,
    'amount', to_char(round(p_amount, 2), 'FM999999990.00'),
    'method', 'Card (Stripe)',
    'date', to_char(coalesce(p_paid_at, now()) at time zone 'UTC', 'YYYY-MM-DD'),
    'ref', left(coalesce(p_ref, ''), 120));
  v_payments := v_payments || jsonb_build_array(v_new);
  select coalesce(sum(nullif(regexp_replace(coalesce(e ->> 'amount', ''), '[^0-9.]', '', 'g'), '')::numeric), 0)
    into v_total from jsonb_array_elements(v_payments) e;
  update public.documents
     set data = v_data || jsonb_build_object(
       'payments', v_payments,
       'paymentAmount', to_char(v_total, 'FM999999990.00'),
       'paymentMethod', v_new ->> 'method',
       'paymentDate', v_new ->> 'date',
       'paymentRef', v_new ->> 'ref',
       'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = p_doc_id;
  return true;
end;
$$;

revoke all on function public.stripe_invoice_for_token(text) from public, anon, authenticated;
revoke all on function public.record_stripe_payment(uuid, text, numeric, timestamptz, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.stripe_invoice_for_token(text) to service_role';
    execute 'grant execute on function public.record_stripe_payment(uuid, text, numeric, timestamptz, text) to service_role';
  end if;
end $$;
