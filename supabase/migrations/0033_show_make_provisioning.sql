-- 0033_show_make_provisioning.sql
-- Prepared 2026-06-11. OWNER APPLIES THIS via the manual db-migrate workflow.
--
-- Phase C: track which Make YouTube connection a show uses and when its publish
-- Router branch was auto-provisioned. Additive, idempotent.

alter table podcast_shows
  add column if not exists make_youtube_connection_id text,
  add column if not exists routes_provisioned_at timestamptz;
