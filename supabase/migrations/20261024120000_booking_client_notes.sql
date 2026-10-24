-- Deploy 34 (QA3): a client created from an online booking keeps the service, preferred dates and note in its notes.
-- Only replaces public.submit_booking_request (same signature, same grants). No table changes, no data changes.
begin;
create or replace function public.submit_booking_request(p_owner text, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_owner uuid := public.booking_owner(p_owner);
  h timestamptz := date_trunc('hour', now()); a int; o int;
  v_name text := left(btrim(coalesce(p ->> 'name', '')), 120);
  v_phone text := left(btrim(coalesce(p ->> 'phone', '')), 40);
  v_email text := lower(left(btrim(coalesce(p ->> 'email', '')), 200));
  v_address text := left(btrim(coalesce(p ->> 'address', '')), 300);
  v_service text := left(btrim(coalesce(p ->> 'service', '')), 120);
  v_pref text := left(btrim(coalesce(p ->> 'preferred', '')), 300);
  v_note text := left(btrim(coalesce(p ->> 'note', '')), 2000);
  v_photos jsonb := coalesce(p -> 'photos', '[]'::jsonb);
  v_digits text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  v_client text; v_id uuid;
begin
  if v_owner is null then return jsonb_build_object('error', 'not_found'); end if;
  if coalesce(p ->> 'website', '') <> '' then return jsonb_build_object('ok', true); end if; -- honeypot: pretend success
  insert into approval_hits values (h, 'book:all', 1) on conflict (minute, key) do update set n = approval_hits.n + 1 returning n into a;
  insert into approval_hits values (h, 'book:' || v_owner::text, 1) on conflict (minute, key) do update set n = approval_hits.n + 1 returning n into o;
  if a > 300 or o > 20 then return jsonb_build_object('error', 'rate'); end if;
  if v_name = '' or (v_email = '' and length(v_digits) < 7) then return jsonb_build_object('error', 'invalid'); end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('error', 'invalid'); end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 3
     or exists (select 1 from jsonb_array_elements(v_photos) e where jsonb_typeof(e) <> 'string' or e #>> '{}' !~ '^data:image/(jpeg|png|webp);base64,' or length(e #>> '{}') > 450000) then
    return jsonb_build_object('error', 'photos');
  end if;
  if v_service <> '' and not exists (select 1 from profiles pr, jsonb_array_elements_text(pr.booking_services) s where pr.id = v_owner and s = v_service) then
    v_service := left('Other: ' || v_service, 120);
  end if;

  select c.id into v_client from clients c
   where c.user_id = v_owner
     and ((v_email <> '' and lower(c.email) = v_email) or (length(v_digits) >= 7 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits))
   order by c.created_at limit 1;
  if v_client is null then
    insert into clients (user_id, name, email, phone, address, notes)
    values (v_owner, v_name, v_email, v_phone, v_address, left(concat_ws(E'\n', 'Added from online booking',
      nullif('Service: ' || v_service, 'Service: '), nullif('Preferred: ' || v_pref, 'Preferred: '), nullif('Note: ' || v_note, 'Note: ')), 4000))
    returning id into v_client;
  end if;
  insert into booking_requests (owner_id, client_id, name, phone, email, address, service, preferred, note, photos)
  values (v_owner, v_client, v_name, v_phone, v_email, v_address, v_service, v_pref, v_note, v_photos)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.submit_booking_request(text, jsonb) from public;
grant execute on function public.submit_booking_request(text, jsonb) to anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.submit_booking_request(text, jsonb) to service_role';
  end if;
end $$;
commit;

