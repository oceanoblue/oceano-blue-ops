-- Itemize an existing order the SAME way the public booking RPC does, so
-- internally-created shoots (New Shoot) carry priced products and an order
-- total — which is what the download paywall charges. Pricing is sqft-tiered
-- via price_for_sqft(), identical to create_booking_v2.

create or replace function public.add_order_items_priced(
  p_order_id uuid,
  p_items jsonb,
  p_sqft integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_price integer;
  v_total integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price := price_for_sqft((v_item->>'product_id')::uuid, coalesce(p_sqft, 0));
    v_total := v_total + v_price * coalesce((v_item->>'quantity')::int, 1);

    insert into order_items (
      order_id, product_id, description, quantity, unit_price_cents,
      total_cents, duration_minutes
    )
    select p_order_id, p.id, p.name,
           coalesce((v_item->>'quantity')::int, 1), v_price,
           v_price * coalesce((v_item->>'quantity')::int, 1),
           p.duration_minutes
    from products p where p.id = (v_item->>'product_id')::uuid;
  end loop;

  update orders
    set subtotal_cents = v_total,
        total_cents = v_total
    where id = p_order_id;

  return v_total;
end;
$$;

-- Only server-side (service role) callers should itemize orders.
revoke execute on function public.add_order_items_priced(uuid, jsonb, integer) from anon, authenticated;
