-- R2: in-app refunds (owner only, logged, partial allowed).
-- Called only by /api/pay/refund with the service role, after the route checked the owner's session.
-- Appends one negative payment row (id "refund_<id>", "of" = the refunded payment) and one history entry.
-- Idempotent on the refund id (a Stripe re_... id, or manual_<request uuid>), so the Stripe webhook that
-- later reports the same refund (record_stripe_refund) sees "duplicate" and does nothing.
-- A refund can never exceed what is left of that payment, nor the net amount still paid on the invoice.
create or replace function public.record_owner_refund(
  p_owner uuid, p_doc uuid, p_payment_id text, p_refund_id text, p_amount numeric,
  p_method text, p_note text default '', p_by text default 'Owner', p_ref text default '', p_default_tz text default 'America/Chicago')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb; v_payments jsonb; v_row jsonb; v_left numeric; v_net numeric; v_amount numeric; v_total numeric; v_tz text;
  v_id text := 'refund_' || coalesce(p_refund_id, '');
  v_at timestamptz := now();
  v_history jsonb;
begin
  if p_owner is null or p_doc is null or coalesce(p_refund_id, '') !~ '^[A-Za-z0-9_-]{3,80}$' or p_amount is null or p_amount <= 0 then
    return jsonb_build_object('result', 'invalid');
  end if;
  select d.data into v_data from public.documents d where d.id = p_doc and d.user_id = p_owner and d.type = 'invoice' for update;
  if v_data is null then return jsonb_build_object('result', 'not_found'); end if;
  v_payments := case when jsonb_typeof(v_data -> 'payments') = 'array' then v_data -> 'payments' else '[]'::jsonb end;
  if exists (select 1 from jsonb_array_elements(v_payments) e where e ->> 'id' = v_id) then
    return jsonb_build_object('result', 'duplicate', 'data', v_data);
  end if;
  select e into v_row from jsonb_array_elements(v_payments) e where e ->> 'id' = p_payment_id and (e ->> 'id') not like 'refund\_%' limit 1;
  if v_row is null then return jsonb_build_object('result', 'no_payment'); end if;
  -- What is left of this payment: its amount minus refunds linked to it ("of"), or, for a card payment,
  -- Stripe-dashboard refunds recorded by the webhook against the same PaymentIntent (ref).
  select coalesce(nullif(regexp_replace(coalesce(v_row ->> 'amount', ''), '[^0-9.-]', '', 'g'), '')::numeric, 0)
       + coalesce(sum(nullif(regexp_replace(coalesce(e ->> 'amount', ''), '[^0-9.-]', '', 'g'), '')::numeric), 0)
    into v_left
    from jsonb_array_elements(v_payments) e
   where (e ->> 'id') like 'refund\_%'
     and (e ->> 'of' = p_payment_id or (e ->> 'of' is null and coalesce(v_row ->> 'ref', '') like 'pi\_%' and e ->> 'ref' = v_row ->> 'ref'));
  select coalesce(sum(nullif(regexp_replace(coalesce(e ->> 'amount', ''), '[^0-9.-]', '', 'g'), '')::numeric), 0)
    into v_net from jsonb_array_elements(v_payments) e;
  v_amount := round(p_amount, 2);
  if v_amount > round(least(v_left, v_net), 2) then
    return jsonb_build_object('result', 'over_refund', 'left', round(greatest(least(v_left, v_net), 0), 2));
  end if;
  select p.timezone into v_tz from public.profiles p where p.id = p_owner;
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := coalesce(p_default_tz, 'UTC'); end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;
  v_payments := v_payments || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'id', v_id, 'amount', to_char(-v_amount, 'FM999999990.00'), 'method', left(coalesce(nullif(p_method, ''), 'Refund'), 60),
    'date', to_char(v_at at time zone v_tz, 'YYYY-MM-DD'), 'ref', left(coalesce(p_ref, ''), 120), 'of', p_payment_id,
    'note', nullif(left(coalesce(p_note, ''), 300), ''))));
  select greatest(coalesce(sum(nullif(regexp_replace(coalesce(e ->> 'amount', ''), '[^0-9.-]', '', 'g'), '')::numeric), 0), 0)
    into v_total from jsonb_array_elements(v_payments) e;
  v_history := case when jsonb_typeof(v_data -> 'history') = 'array' then v_data -> 'history' else '[]'::jsonb end;
  v_history := v_history || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'at', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'by', left(coalesce(nullif(p_by, ''), 'Owner'), 80), 'byId', p_owner::text,
    'action', 'Refunded $' || to_char(v_amount, 'FM999999990.00') || ' (' || left(coalesce(nullif(p_method, ''), 'Refund'), 60) || ')',
    'note', nullif(left(coalesce(p_note, ''), 300), ''))));
  v_data := v_data || jsonb_build_object('payments', v_payments, 'paymentAmount', to_char(v_total, 'FM999999990.00'), 'history', v_history,
    'updatedAt', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  update public.documents set data = v_data where id = p_doc;
  return jsonb_build_object('result', 'recorded', 'data', v_data);
end;
$$;
revoke all on function public.record_owner_refund(uuid, uuid, text, text, numeric, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_owner_refund(uuid, uuid, text, text, numeric, text, text, text, text, text) to service_role;
