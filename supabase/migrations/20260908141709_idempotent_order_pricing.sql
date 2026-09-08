begin;
set local lock_timeout = '5s';
-- Each supplied product replaces its own line; other products/custom lines
-- remain. Replaying a server request cannot append duplicates or reset totals.
create or replace function public.add_order_items_priced(p_order_id uuid,p_items jsonb,p_sqft integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_price integer; v_total integer; v_quantity integer; v_product uuid;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) > 30 then raise exception 'invalid_items'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x group by x->>'product_id' having count(*)>1) then raise exception 'duplicate_items'; end if;
  perform 1 from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_product:=(v_item->>'product_id')::uuid;
    v_quantity:=coalesce((v_item->>'quantity')::int,1);
    if v_quantity not between 1 and 20 then raise exception 'invalid_quantity'; end if;
    if not exists(select 1 from public.products where id=v_product and is_active) then raise exception 'invalid_product'; end if;
    v_price:=public.price_for_sqft(v_product,coalesce(p_sqft,0));
    if v_price is null or v_price<0 then raise exception 'invalid_price'; end if;
    delete from public.order_items where order_id=p_order_id and product_id=v_product;
    insert into public.order_items(order_id,product_id,description,quantity,unit_price_cents,total_cents,duration_minutes)
      select p_order_id,id,name,v_quantity,v_price,v_price*v_quantity,duration_minutes from public.products where id=v_product;
  end loop;
  select coalesce(sum(total_cents),0)::integer into v_total from public.order_items where order_id=p_order_id;
  update public.orders set subtotal_cents=v_total,total_cents=v_total where id=p_order_id;
  return v_total;
end;
$$;
revoke all on function public.add_order_items_priced(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.add_order_items_priced(uuid,jsonb,integer) to service_role;
commit;
