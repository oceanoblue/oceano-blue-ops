-- =============================================================
-- 0070 — Lock contractor order access behind a price-free view
-- =============================================================
-- Contractors (field photographers) must NEVER see the client-facing price.
--
-- Before this migration, 0053's policy
--     "contractor read own orders"  →  using (contractor_id = current_contractor_id())
-- granted row access to the ENTIRE orders row. Postgres RLS is row-level, not
-- column-level, so every column of a contractor's own shoots was reachable by a
-- direct Supabase query (the field portal ships the anon key): total_cents,
-- subtotal_cents, download_paid_cents, client_notes, client_id, staffing ids…
-- No screen displayed them, but they were not actually protected.
--
-- Fix: drop that over-broad base-table policy and expose contractors a curated,
-- owner-privileged (SECURITY DEFINER) view — field_orders — that self-scopes to
-- the caller via current_contractor_id() and projects ONLY the columns the field
-- portal needs. Pricing, billing, client identity/notes, and internal staffing
-- ids are physically absent from the projection, so they can't be selected at all.
-- =============================================================

-- 1. Remove the over-broad base-table read for contractors. After this, a
--    contractor has NO select policy on orders → RLS denies direct reads.
--    (Team keeps its own all-access policy; every contractor mutation still
--    goes through the SECURITY DEFINER RPCs from 0053/0057, which don't rely
--    on this policy.)
drop policy if exists "contractor read own orders" on orders;

-- 2. Curated, contractor-safe projection of orders.
--    security_invoker = off (owner-privileged): the view runs as its owner and
--    bypasses orders' RLS, so the WHERE clause below is the ONLY thing scoping
--    rows — it restricts to the calling contractor's own shoots. Because the
--    projection omits every price/billing/client/staff column, those values are
--    unreachable through this view no matter what the caller asks for.
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
  o.pay_amount_cents,     -- the contractor's OWN pay (theirs to see)
  o.pay_status,
  o.pay_request_id,
  o.contractor_id,
  o.listing_id,
  -- Listing fields the portal shows, as a nested object. Named `listing`
  -- (singular) NOT `listings`, so PostgREST can't confuse this jsonb column
  -- with an embed of the real `listings` table — it's unambiguously a column.
  jsonb_build_object(
    'address_line1', l.address_line1,
    'address_line2', l.address_line2,
    'city',          l.city,
    'state',         l.state,
    'zip',           l.zip,
    'sqft',          l.sqft,
    'bedrooms',      l.bedrooms,
    'bathrooms',     l.bathrooms,
    'property_type', l.property_type
  ) as listing
from orders o
left join listings l on l.id = o.listing_id
where o.contractor_id = current_contractor_id();

comment on view field_orders is
  'Contractor-safe projection of orders (0070). Owner-privileged, self-scopes to '
  'current_contractor_id(), and omits ALL pricing/billing/client/staff columns '
  '(total_cents, subtotal_cents, download_paid_*, client_id, client_notes, '
  'photographer_id, editor_id, coordinator_id, package_name, …). The field portal '
  'reads this instead of the orders table.';

-- 3. Grants. Only authenticated users; anon gets nothing. A team member (or any
--    non-contractor) hitting this view has current_contractor_id() = null, so
--    the WHERE clause yields zero rows — no leak.
revoke all on field_orders from public, anon;
grant select on field_orders to authenticated;
