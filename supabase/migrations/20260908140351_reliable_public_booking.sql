begin;
set local lock_timeout = '5s';

create or replace function create_draft_order(
  p_client_email text,
  p_client_name  text,
  p_client_phone text,
  p_client_brokerage text,
  p_address_line1 text,
  p_city text,
  p_state text,
  p_zip text,
  p_bedrooms int,
  p_bathrooms numeric,
  p_sqft int,
  p_requested_at timestamptz,
  p_services text[],
  p_notes text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_client_id uuid;
  v_listing_id uuid;
  v_order_id uuid;
  v_svc text;
begin
  -- Unverified public booking details must not overwrite an existing profile.
  perform pg_advisory_xact_lock(hashtextextended(lower(p_client_email), 721));
  select id into v_client_id from public.clients where lower(email) = lower(p_client_email) limit 1;
  if v_client_id is null then
    insert into public.clients(email, full_name, phone, brokerage)
    values (lower(p_client_email), p_client_name, nullif(p_client_phone,''), nullif(p_client_brokerage,''))
    returning id into v_client_id;
  end if;

  -- listing
  insert into listings (
    client_id, address_line1, city, state, zip,
    bedrooms, bathrooms, sqft, status
  ) values (
    v_client_id, p_address_line1, p_city, p_state, p_zip,
    p_bedrooms, p_bathrooms, p_sqft, 'draft'
  ) returning id into v_listing_id;

  -- order
  insert into orders (
    listing_id, client_id, status, scheduled_at, client_notes
  ) values (
    v_listing_id, v_client_id, 'draft', p_requested_at, p_notes
  ) returning id into v_order_id;

  -- services
  foreach v_svc in array p_services loop
    insert into order_services (order_id, service_type, description, quantity)
    values (v_order_id, v_svc::service_type, v_svc, 1);
  end loop;

  insert into activity_log (order_id, listing_id, actor_type, action, details)
  values (v_order_id, v_listing_id, 'client', 'order_drafted',
    jsonb_build_object('source', 'booking_form'));

  return v_order_id;
end;
$$;


revoke all on function public.create_draft_order(text,text,text,text,text,text,text,text,int,numeric,int,timestamptz,text[],text) from public,anon,authenticated;
grant execute on function public.create_draft_order(text,text,text,text,text,text,text,text,int,numeric,int,timestamptz,text[],text) to service_role;

create or replace function create_booking_v2(
  p_client_email text,
  p_client_name  text,
  p_client_phone text,
  p_client_brokerage text,

  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_zip text,
  p_lat double precision,
  p_lng double precision,
  p_sqft int,

  p_scheduled_at timestamptz,
  p_duration_minutes int,
  p_timezone text,
  p_access_method text,
  p_highlights text,

  -- array of objects: { product_id uuid, quantity int }
  p_items jsonb,

  p_photographer_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_client_id  uuid;
  v_listing_id uuid;
  v_order_id   uuid;
  v_item       jsonb;
  v_price      int;
  v_total      int := 0;
  v_duration   int := 0;
begin
  -- 1. upsert client
  -- Unverified public booking details must not overwrite an existing profile.
  perform pg_advisory_xact_lock(hashtextextended(lower(p_client_email), 721));
  select id into v_client_id from public.clients where lower(email) = lower(p_client_email) limit 1;
  if v_client_id is null then
    insert into public.clients(email, full_name, phone, brokerage)
    values (lower(p_client_email), p_client_name, nullif(p_client_phone,''), nullif(p_client_brokerage,''))
    returning id into v_client_id;
  end if;

  -- 2. listing
  insert into listings (
    client_id, address_line1, address_line2, city, state, zip,
    lat, lng, sqft, access_method, highlights, status
  ) values (
    v_client_id, p_address_line1, nullif(p_address_line2, ''), p_city, p_state, p_zip,
    p_lat, p_lng, p_sqft, p_access_method, p_highlights, 'draft'
  ) returning id into v_listing_id;

  -- 3. order shell (photographer assigned here so the double-book guard runs
  --    atomically — a conflict rolls the whole booking back).
  insert into orders (
    listing_id, client_id, status, scheduled_at, duration_minutes,
    timezone, client_notes, photographer_id
  ) values (
    v_listing_id, v_client_id, 'booked', p_scheduled_at, p_duration_minutes,
    coalesce(p_timezone, 'America/New_York'),
    nullif(p_highlights, ''), p_photographer_id
  ) returning id into v_order_id;

  -- 4. line items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_price := price_for_sqft((v_item->>'product_id')::uuid, p_sqft);
    v_total := v_total + v_price * coalesce((v_item->>'quantity')::int, 1);
    v_duration := v_duration + coalesce(
      (select duration_minutes from products where id = (v_item->>'product_id')::uuid), 0
    ) * coalesce((v_item->>'quantity')::int, 1);

    insert into order_items (
      order_id, product_id, description, quantity, unit_price_cents,
      total_cents, duration_minutes
    )
    select v_order_id, p.id, p.name,
           coalesce((v_item->>'quantity')::int, 1), v_price,
           v_price * coalesce((v_item->>'quantity')::int, 1),
           p.duration_minutes
    from products p where p.id = (v_item->>'product_id')::uuid;
  end loop;

  update orders
    set subtotal_cents = v_total,
        total_cents = v_total,
        duration_minutes = greatest(v_duration, p_duration_minutes)
    where id = v_order_id;

  insert into activity_log (order_id, listing_id, actor_type, action, details)
  values (v_order_id, v_listing_id, 'client', 'order_booked',
    jsonb_build_object('source', 'wizard', 'items', p_items));

  return v_order_id;
end; $$;


revoke execute on function public.create_booking_v2(text,text,text,text,text,text,text,text,text,double precision,double precision,integer,timestamptz,integer,text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_booking_v2(text,text,text,text,text,text,text,text,text,double precision,double precision,integer,timestamptz,integer,text,text,text,jsonb,uuid) to service_role;

create table public.booking_requests (
  id uuid primary key,
  request_hash text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from public, anon, authenticated;
grant all on public.booking_requests to service_role;
create index booking_requests_order_idx on public.booking_requests(order_id);

create table public.booking_followups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('calendar','client_email','office_email','office_sms')),
  recipient text not null default '',
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','running','complete','failed','needs_review')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(order_id,kind,recipient)
);
alter table public.booking_followups enable row level security;
revoke all on public.booking_followups from public, anon, authenticated;
grant select on public.booking_followups to authenticated;
grant all on public.booking_followups to service_role;
create policy "staff read booking followups" on public.booking_followups for select to authenticated using ((select public.is_team_member()));
create index booking_followups_pending_idx on public.booking_followups(available_at) where status in ('pending','running');

create function public.commit_public_booking(p_payload jsonb, p_request_id uuid, p_request_hash text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare
  v_order uuid;
  v_existing public.booking_requests;
  v_duration int;
  v_start timestamptz := (p_payload->>'scheduled_at')::timestamptz;
  v_ph uuid := (p_payload->>'photographer_id')::uuid;
  v_settings public.business_settings;
  v_member record;
  v_item jsonb;
  v_count int;
  v_audience text := case when p_payload->>'project_type' in ('architectural','interior_design') then 'architectural' else 'real_estate' end;
begin
  if p_request_id is null or p_request_hash is null or length(p_request_hash) <> 64 then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 723));
  select * into v_existing from public.booking_requests where id=p_request_id;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception 'idempotency_conflict' using errcode='22023'; end if;
    return v_existing.order_id;
  end if;
  if v_ph is null or v_start is null then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if p_payload->'items' is null or jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') not between 1 and 30 then raise exception 'invalid_items'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x group by x->>'product_id' having count(*)>1) then raise exception 'duplicate_items'; end if;
  v_duration:=0;
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    if v_item->>'quantity' is null or (v_item->>'quantity')::int not between 1 and 20 then raise exception 'invalid_quantity'; end if;
    select duration_minutes into v_count from public.products where id=(v_item->>'product_id')::uuid and is_active and audiences @> array[v_audience];
    if not found then raise exception 'invalid_product'; end if;
    v_duration := v_duration + v_count*(v_item->>'quantity')::int;
  end loop;
  if v_duration is null or v_duration not between 15 and 720 then raise exception 'invalid_duration'; end if;
  select * into v_settings from public.business_settings where id=true;
  if v_start < now() + make_interval(hours=>coalesce(v_settings.min_notice_hours,4))
     or (v_start at time zone coalesce(v_settings.default_timezone,'America/New_York'))::date >
        (now() at time zone coalesce(v_settings.default_timezone,'America/New_York'))::date + coalesce(v_settings.max_notice_days,30) then
    raise exception 'slot_unavailable' using errcode='23P01';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_ph::text)::bigint);
  if not exists(select 1 from public.team_members where id=v_ph and is_active and role in ('admin','photographer')) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if not exists(
    select 1 from public.team_availability a where a.team_member_id=v_ph and a.is_active
    and a.day_of_week=extract(dow from v_start at time zone a.timezone)
    and v_start >= (((v_start at time zone a.timezone)::date + a.start_local) at time zone a.timezone)
    and v_start + make_interval(mins=>v_duration) <= (((v_start at time zone a.timezone)::date + a.end_local) at time zone a.timezone)
  ) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  if exists(select 1 from public.schedule_blocks b where b.team_member_id=v_ph and not b.is_available
    and v_start < b.ends_at + make_interval(mins=>coalesce(v_settings.buffer_minutes,30))
    and v_start + make_interval(mins=>v_duration+coalesce(v_settings.buffer_minutes,30)) > b.starts_at) then
    raise exception 'slot_unavailable' using errcode='23P01';
  end if;
  v_order := public.create_booking_v2(
    p_payload->>'client_email',p_payload->>'client_name',p_payload->>'client_phone',p_payload->>'client_brokerage',
    p_payload->>'address_line1',p_payload->>'address_line2',p_payload->>'city',p_payload->>'state',p_payload->>'zip',
    (p_payload->>'lat')::double precision,(p_payload->>'lng')::double precision,(p_payload->>'sqft')::int,
    v_start,v_duration,p_payload->>'timezone',p_payload->>'access_method',p_payload->>'highlights',p_payload->'items',v_ph
  );
  update public.orders set project_type=coalesce(p_payload->>'project_type','mls_real_estate')::project_type where id=v_order;
  -- Complete assignment in the same transaction as the order and follow-ups.
  select id,pay_rate_cents into v_member from public.contractors where team_member_id=v_ph and is_active limit 1;
  if found then update public.orders set contractor_id=v_member.id,pay_amount_cents=coalesce(v_member.pay_rate_cents,0) where id=v_order; end if;
  insert into public.booking_requests(id,request_hash,order_id) values(p_request_id,p_request_hash,v_order);
  insert into public.booking_followups(order_id,kind,recipient,payload) values
    (v_order,'calendar','',p_payload),(v_order,'client_email',p_payload->>'client_email',p_payload);
  insert into public.booking_followups(order_id,kind,recipient,payload)
    select v_order,'office_email',lower(email),p_payload from public.team_members where is_active and role='admin' and email is not null and email<>'' on conflict do nothing;
  insert into public.booking_followups(order_id,kind,recipient,payload)
    select v_order,'office_sms',phone,p_payload from public.team_members where is_active and role='admin' and phone is not null and phone<>'' on conflict do nothing;
  return v_order;
end;
$$;
revoke all on function public.commit_public_booking(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commit_public_booking(jsonb,uuid,text) to service_role;

create function public.claim_booking_followups(p_limit int default 5)
returns setof public.booking_followups language sql security invoker set search_path=public as $$
  update public.booking_followups f set status='running', attempts=f.attempts+1, locked_at=now(), lease_token=gen_random_uuid()
  where f.id in (
    select id from public.booking_followups
    where attempts<6 and ((status='pending' and available_at<=now()) or (status='running' and locked_at<now()-interval '5 minutes' and kind<>'office_sms'))
    order by available_at limit least(greatest(p_limit,1),10) for update skip locked
  ) returning f.*;
$$;
revoke all on function public.claim_booking_followups(int) from public,anon,authenticated;
grant execute on function public.claim_booking_followups(int) to service_role;
commit;
