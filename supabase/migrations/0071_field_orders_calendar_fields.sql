-- =============================================================
-- 0071 — field_orders: add pay_tier + has_360 for the photographer calendar
-- =============================================================
-- The contractor calendar colors shoots by pay tier and badges the ones with a
-- 360 tour. Neither signal was on the view (0070). We add them as COMPUTED
-- columns so contractors still get no direct access to pricing tables:
--   * pay_tier  — 'small' | 'large', by the listing sqft vs the business cutoff
--     (business_settings.pay_small_max_sqft, the same rule 0058 pays on). This is
--     the tier, NOT the dollar amount — the client price stays hidden.
--   * has_360   — whether the shoot includes a 360 / Matterport tour, detected
--     across all three storage models: structured order_services, order_items ->
--     products, and the free-text internal_notes on field-logged shoots.
-- The view is owner-privileged (security_invoker = off), so these subqueries read
-- order_services / order_items / products / business_settings without granting
-- contractors any access to those tables.
-- =============================================================

drop view if exists field_orders;
create view field_orders
with (security_invoker = off)
as
select
  o.id,
  o.order_number,
  o.status,
  o.source,
  o.scheduled_at,
  o.created_at,
  o.updated_at,
  o.dropbox_intake_url,
  o.dropbox_intake_path,
  o.internal_notes,
  o.contractor_response,
  o.contractor_responded_at,
  o.contractor_response_note,
  o.pay_amount_cents,      -- the contractor's OWN pay (theirs to see)
  o.pay_status,
  o.pay_request_id,
  o.contractor_id,
  o.listing_id,
  -- Pay tier by sqft (same rule as 0058's payout). Tier label only — not price.
  case
    when l.sqft is not null
     and l.sqft >= coalesce((select pay_small_max_sqft from business_settings limit 1), 2000)
    then 'large' else 'small'
  end as pay_tier,
  -- Does this shoot include a 360 / Matterport tour? Checked across every model.
  (
    exists (
      select 1 from order_services os
      where os.order_id = o.id and os.service_type in ('virtual_tour', 'matterport')
    )
    or exists (
      select 1 from order_items oi
      join products p on p.id = oi.product_id
      where oi.order_id = o.id and p.slug in ('matterport_3d', 'virtual_tour', 'tour_360')
    )
    or (o.internal_notes is not null and o.internal_notes ~* '360')
  ) as has_360,
  jsonb_build_object(
    'address_line1', l.address_line1, 'address_line2', l.address_line2,
    'city', l.city, 'state', l.state, 'zip', l.zip, 'sqft', l.sqft,
    'bedrooms', l.bedrooms, 'bathrooms', l.bathrooms, 'property_type', l.property_type
  ) as listing
from orders o
left join listings l on l.id = o.listing_id
where o.contractor_id = current_contractor_id();

comment on view field_orders is
  'Contractor-safe projection of orders (0070/0071). Owner-privileged, self-scopes to current_contractor_id(), omits ALL pricing/billing/client/staff columns. Adds computed pay_tier (small/large by sqft) and has_360 for the field calendar. The field portal reads this instead of the orders table.';

revoke all on field_orders from public, anon;
grant select on field_orders to authenticated;
revoke insert, update, delete, truncate, references, trigger on field_orders from authenticated;
