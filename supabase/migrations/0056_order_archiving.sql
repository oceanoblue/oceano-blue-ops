-- =============================================================
-- 0056 — Shoot archiving
-- =============================================================
-- Owner request: decide which shoots are visible day-to-day without
-- deleting anything. NULL = active; timestamp = archived. Archived
-- orders are hidden from the orders list, overview, and schedule;
-- a "Show archived" filter reveals them and archiving is reversible.
alter table orders add column if not exists archived_at timestamptz;
create index if not exists orders_archived_idx on orders(archived_at) where archived_at is not null;
