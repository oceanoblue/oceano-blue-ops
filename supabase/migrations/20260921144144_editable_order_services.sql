begin;

alter table public.orders add column services_revision integer not null default 0;

-- A payment from an older checkout must be retained for reconciliation, never
-- silently lost or treated as full payment for newly added services.
create table public.order_payment_reviews (
  session_id text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_cents integer not null,
  checkout_revision integer not null,
  current_revision integer not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index order_payment_reviews_order_idx on public.order_payment_reviews(order_id);
alter table public.order_payment_reviews enable row level security;
revoke all on public.order_payment_reviews from anon, authenticated;
grant select on public.order_payment_reviews to authenticated;
grant all on public.order_payment_reviews to service_role;
create policy "staff read payment reviews" on public.order_payment_reviews
  for select to authenticated using ((select public.is_team_member()));

create or replace function public.edit_order_services(
  p_order_id uuid, p_expected_updated_at timestamptz, p_items jsonb,
  p_sqft integer, p_expected_sqft integer, p_adjustment_cents integer default 0
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_sqft integer;
  v_before jsonb;
  v_legacy jsonb;
  v_item jsonb;
  v_product uuid;
  v_quantity integer;
  v_price integer;
  v_duration integer;
  v_subtotal bigint := 0;
  v_updated timestamptz;
begin
  if not coalesce(public.is_team_member(), false) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'too_many_items'; end if;
  if p_sqft is not null and (p_sqft < 1 or p_sqft > 1000000) then raise exception 'invalid_sqft'; end if;
  if p_adjustment_cents is null or abs(p_adjustment_cents::bigint) > 100000000 then raise exception 'invalid_adjustment'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_missing'; end if;
  if v_order.updated_at is distinct from p_expected_updated_at then raise exception 'order_changed'; end if;
  if v_order.download_paid_at is not null then raise exception 'order_paid'; end if;
  if exists(select 1 from public.order_payment_reviews where order_id=p_order_id and resolved_at is null) then
    raise exception 'payment_needs_review';
  end if;
  select sqft into v_sqft from public.listings where id=v_order.listing_id for update;
  if v_sqft is distinct from p_expected_sqft then raise exception 'property_changed'; end if;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_before from public.order_items i where order_id=p_order_id;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_legacy from public.order_services s where order_id=p_order_id;

  -- Validate the entire proposed invoice before replacing any rows.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' or
       coalesce(v_item->>'quantity','') !~ '^[0-9]+$' or
       coalesce(v_item->>'unit_price_cents','') !~ '^[0-9]+$' then raise exception 'invalid_item'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price_cents')::integer;
    if v_quantity < 1 or v_quantity > 20 or v_price < 0 or v_price > 10000000 then raise exception 'invalid_item'; end if;
    if length(btrim(coalesce(v_item->>'description',''))) not between 1 and 200 then raise exception 'invalid_description'; end if;
    v_product := nullif(v_item->>'product_id','')::uuid;
    if v_product is not null and not exists (
      select 1 from public.products p where p.id=v_product and (p.is_active or exists (
        select 1 from public.order_items i where i.order_id=p_order_id and i.product_id=p.id
      ))
    ) then raise exception 'invalid_product'; end if;
    v_subtotal := v_subtotal + v_quantity::bigint * v_price;
  end loop;
  if v_subtotal + p_adjustment_cents not between 0 and 100000000 then raise exception 'invalid_total'; end if;

  delete from public.order_items where order_id=p_order_id;
  -- Once migrated to priced items, removed legacy services must not reappear.
  delete from public.order_services where order_id=p_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product := nullif(v_item->>'product_id','')::uuid;
    select duration_minutes into v_duration from public.products where id=v_product;
    insert into public.order_items(order_id,product_id,description,quantity,unit_price_cents,total_cents,duration_minutes)
    values(p_order_id,v_product,btrim(v_item->>'description'),(v_item->>'quantity')::int,
      (v_item->>'unit_price_cents')::int,(v_item->>'quantity')::int*(v_item->>'unit_price_cents')::int,coalesce(v_duration,0));
  end loop;
  if v_sqft is distinct from p_sqft then update public.listings set sqft=p_sqft where id=v_order.listing_id; end if;
  update public.orders set subtotal_cents=v_subtotal::int,total_cents=(v_subtotal+p_adjustment_cents)::int,
    services_revision=services_revision+1, updated_at=clock_timestamp()
    where id=p_order_id returning updated_at into v_updated;
  insert into public.activity_log(order_id,listing_id,actor_id,actor_type,action,details)
  values(p_order_id,v_order.listing_id,auth.uid(),'team','order_services_edited',jsonb_build_object(
    'before_items',v_before,'before_legacy_items',v_legacy,'after_items',p_items,'before_total_cents',v_order.total_cents,
    'after_total_cents',v_subtotal+p_adjustment_cents,'before_sqft',v_sqft,'after_sqft',p_sqft,'adjustment_cents',p_adjustment_cents));
  return jsonb_build_object('updated_at',v_updated,'total_cents',v_subtotal+p_adjustment_cents);
end;
$$;
revoke all on function public.edit_order_services(uuid,timestamptz,jsonb,integer,integer,integer) from public,anon;
grant execute on function public.edit_order_services(uuid,timestamptz,jsonb,integer,integer,integer) to authenticated;

-- Lock the same order as service editing so payment and invoice changes cannot
-- race. Legacy checkouts have revision zero. Promotions may legitimately pay $0.
create or replace function public.settle_order_checkout(
  p_order_id uuid, p_session_id text, p_amount_cents integer, p_revision integer
) returns text
language plpgsql security invoker set search_path = public as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_missing'; end if;
  if v_order.download_stripe_session_id=p_session_id then return 'already_paid'; end if;
  if v_order.services_revision <> p_revision or v_order.download_paid_at is not null or exists (
    select 1 from public.order_payment_reviews where order_id=p_order_id and resolved_at is null
  ) then
    insert into public.order_payment_reviews(session_id,order_id,amount_cents,checkout_revision,current_revision)
    values(p_session_id,p_order_id,p_amount_cents,p_revision,v_order.services_revision)
    on conflict(session_id) do nothing;
    return 'needs_review';
  end if;
  update public.orders set download_paid_at=now(),download_paid_cents=p_amount_cents,
    download_stripe_session_id=p_session_id where id=p_order_id;
  return 'paid';
end;
$$;
revoke all on function public.settle_order_checkout(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.settle_order_checkout(uuid,text,integer,integer) to service_role;
commit;
