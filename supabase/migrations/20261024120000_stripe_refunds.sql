-- R95/R97: Stripe refunds and stricter card payments. Safe to re-run.
-- Run after 20261024110000_crew_signup.sql.
-- 1. record_stripe_refund(): one negative payment row per Stripe refund id ("refund_<re_id>"), idempotent.
--    Invoice missing -> parked in stripe_pending_payments (amount negative, last_error 'refund ...').
-- 2. record_stripe_payment_v2(): the paid sum keeps refund rows negative (regex keeps '-').
-- 3. park_stripe_payment(): the webhook parks a payment it won't record (no matching checkout, wrong
--    currency) for the owner to review; never touches the invoice.
-- 4. stripe_checkout_sessions.status may be 'failed' (async payment failed).

CREATE OR REPLACE FUNCTION public.record_stripe_payment_v2(p_doc_id text, p_session_id text, p_amount numeric, p_paid_at timestamp with time zone, p_ref text DEFAULT ''::text, p_event_id text DEFAULT ''::text, p_default_tz text DEFAULT 'America/Chicago'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_doc uuid;
  v_data jsonb;
  v_user uuid;
  v_tz text;
  v_payments jsonb;
  v_id text := 'stripe_' || coalesce(p_session_id, '');
  v_ref text := left(coalesce(p_ref, ''), 120);
  v_new jsonb;
  v_total numeric;
begin
  if p_session_id is null or length(p_session_id) < 3 or p_amount is null or p_amount <= 0 then
    return 'invalid';
  end if;
  begin
    v_doc := nullif(p_doc_id, '')::uuid;
  exception when others then
    v_doc := null;
  end;
  if v_doc is not null then
    select d.data, d.user_id into v_data, v_user from public.documents d
     where d.id = v_doc and d.type = 'invoice' for update;
  end if;
  if v_doc is null or not found then
    insert into public.stripe_pending_payments (session_id, event_id, doc_id, amount, paid_at, ref, last_error)
    values (p_session_id, nullif(p_event_id, ''), p_doc_id, p_amount, coalesce(p_paid_at, now()), v_ref, 'invoice not found')
    on conflict (session_id) do update set attempts = stripe_pending_payments.attempts + 1, event_id = excluded.event_id;
    return 'pending';
  end if;

  v_data := coalesce(v_data, '{}'::jsonb);
  if jsonb_typeof(v_data -> 'payments') = 'array' then
    v_payments := v_data -> 'payments';
  elsif coalesce(nullif(regexp_replace(coalesce(v_data ->> 'paymentAmount', ''), '[^0-9.]', '', 'g'), ''), '0')::numeric > 0 then
    v_payments := jsonb_build_array(jsonb_build_object(
      'id', 'legacy', 'amount', v_data ->> 'paymentAmount', 'method', coalesce(v_data ->> 'paymentMethod', ''),
      'date', coalesce(v_data ->> 'paymentDate', ''), 'ref', coalesce(v_data ->> 'paymentRef', '')));
  else
    v_payments := '[]'::jsonb;
  end if;
  -- Idempotent: same Checkout session, or the same payment_intent recorded under another session.
  if exists (
    select 1 from jsonb_array_elements(v_payments) e
     where e ->> 'id' = v_id
        or (v_ref like 'pi_%' and e ->> 'id' like 'stripe_%' and e ->> 'ref' = v_ref)
  ) then
    update public.stripe_pending_payments set resolved_at = coalesce(resolved_at, now()) where session_id = p_session_id;
    return 'duplicate';
  end if;

  -- Business-local date: profile timezone if valid, else the server default, else UTC.
  select p.timezone into v_tz from public.profiles p where p.id = v_user;
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := p_default_tz;
  end if;
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;

  v_new := jsonb_build_object(
    'id', v_id,
    'amount', to_char(round(p_amount, 2), 'FM999999990.00'),
    'method', 'Card (Stripe)',
    'date', to_char(coalesce(p_paid_at, now()) at time zone v_tz, 'YYYY-MM-DD'),
    'ref', v_ref);
  v_payments := v_payments || jsonb_build_array(v_new);
  select coalesce(sum(nullif(regexp_replace(coalesce(e ->> 'amount', ''), '[^0-9.-]', '', 'g'), '')::numeric), 0)
    into v_total from jsonb_array_elements(v_payments) e;
  update public.documents
     set data = v_data || jsonb_build_object(
       'payments', v_payments,
       'paymentAmount', to_char(v_total, 'FM999999990.00'),
       'paymentMethod', v_new ->> 'method',
       'paymentDate', v_new ->> 'date',
       'paymentRef', v_new ->> 'ref',
       'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = v_doc;
  update public.stripe_pending_payments set resolved_at = now() where session_id = p_session_id;
  update public.stripe_checkout_sessions set status = 'complete' where session_id = p_session_id;
  return 'recorded';
end;
$function$

;

create or replace function public.record_stripe_refund(p_doc_id text, p_refund_id text, p_amount numeric, p_at timestamptz, p_ref text default '', p_default_tz text default 'America/Chicago')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid; v_data jsonb; v_user uuid; v_tz text; v_payments jsonb; v_total numeric;
  v_id text := 'refund_' || coalesce(p_refund_id, '');
begin
  if p_refund_id is null or length(p_refund_id) < 3 or p_amount is null or p_amount <= 0 then return 'invalid'; end if;
  begin v_doc := nullif(p_doc_id, '')::uuid; exception when others then v_doc := null; end;
  if v_doc is not null then
    select d.data, d.user_id into v_data, v_user from public.documents d where d.id = v_doc and d.type = 'invoice' for update;
  end if;
  if v_doc is null or v_data is null then
    insert into public.stripe_pending_payments (session_id, doc_id, amount, paid_at, ref, last_error)
    values (v_id, p_doc_id, -p_amount, coalesce(p_at, now()), left(coalesce(p_ref, ''), 120), 'refund: invoice not found')
    on conflict (session_id) do update set attempts = stripe_pending_payments.attempts + 1;
    return 'pending';
  end if;
  v_payments := case when jsonb_typeof(v_data -> 'payments') = 'array' then v_data -> 'payments' else '[]'::jsonb end;
  if exists (select 1 from jsonb_array_elements(v_payments) e where e ->> 'id' = v_id) then return 'duplicate'; end if;
  select p.timezone into v_tz from public.profiles p where p.id = v_user;
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := coalesce(p_default_tz, 'UTC'); end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;
  v_payments := v_payments || jsonb_build_array(jsonb_build_object(
    'id', v_id, 'amount', to_char(-round(p_amount, 2), 'FM999999990.00'), 'method', 'Card refund (Stripe)',
    'date', to_char(coalesce(p_at, now()) at time zone v_tz, 'YYYY-MM-DD'), 'ref', left(coalesce(p_ref, ''), 120)));
  select greatest(coalesce(sum(nullif(regexp_replace(coalesce(e ->> 'amount', ''), '[^0-9.-]', '', 'g'), '')::numeric), 0), 0)
    into v_total from jsonb_array_elements(v_payments) e;
  update public.documents set data = v_data || jsonb_build_object(
      'payments', v_payments, 'paymentAmount', to_char(v_total, 'FM999999990.00'),
      'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where id = v_doc;
  return 'recorded';
end;
$$;
revoke all on function public.record_stripe_refund(text, text, numeric, timestamptz, text, text) from public, anon, authenticated;

create or replace function public.park_stripe_payment(p_session_id text, p_doc_id text, p_amount numeric, p_at timestamptz, p_ref text, p_event_id text, p_reason text)
returns text
language sql
security definer
set search_path = public
as $$
  insert into public.stripe_pending_payments (session_id, event_id, doc_id, amount, paid_at, ref, last_error, owner_id)
  values (p_session_id, nullif(p_event_id, ''), p_doc_id, coalesce(p_amount, 0), coalesce(p_at, now()), left(coalesce(p_ref, ''), 120), left(coalesce(p_reason, ''), 200),
          (select user_id from public.documents where id::text = p_doc_id))
  on conflict (session_id) do update set attempts = stripe_pending_payments.attempts + 1, last_error = excluded.last_error
  returning 'parked'
$$;
revoke all on function public.park_stripe_payment(text, text, numeric, timestamptz, text, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.record_stripe_refund(text, text, numeric, timestamptz, text, text) to service_role;
    grant execute on function public.park_stripe_payment(text, text, numeric, timestamptz, text, text, text) to service_role;
  end if;
end $$;
