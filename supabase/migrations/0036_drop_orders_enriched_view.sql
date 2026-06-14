-- 0036_drop_orders_enriched_view.sql
-- Security hardening: remove the dead `orders_enriched` view.
--
-- 0004_seed_helpers.sql created `orders_enriched` (orders ⨝ clients ⨝ listings
-- ⨝ team_members, including client PII). Unlike `pipeline_counts` it never got
-- security_invoker, so as a default (definer-semantics) view it would bypass
-- the querying user's RLS — a portal client with an authenticated JWT could
-- read every client's PII via PostgREST. The view is not referenced anywhere
-- in the app and is already absent from the live database, but the 0004
-- definition means a fresh migration replay would recreate the vulnerable view.
--
-- Drop it permanently. Idempotent (no-op where it doesn't exist).

drop view if exists public.orders_enriched;
