-- =============================================================
-- 0080 — RLS policies for order_items (were missing entirely)
-- =============================================================
-- order_items had RLS ENABLED but ZERO policies, so every read through the
-- authenticated session client was denied (only the service-role admin client,
-- used by Stripe checkout, could see rows). The staff order page reads with the
-- session client, so it saw no line items and fell back to the empty legacy
-- order_services table — rendering "No line items" even on priced orders.
-- Mirror order_services' policies exactly.
-- =============================================================

create policy "team rw order_items" on order_items
  for all
  using (is_team_member())
  with check (is_team_member());

create policy "client read own order_items" on order_items
  for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.client_id in (select current_client_ids())
    )
  );
