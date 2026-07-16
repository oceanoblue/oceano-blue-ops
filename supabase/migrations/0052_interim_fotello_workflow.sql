-- =============================================================
-- 0052 — Interim Fotello workflow (2026-07-16)
-- =============================================================
-- Owner decision: the in-platform merge + AI-enhance are not production
-- quality yet (merge and enhancement both misbehaving), so the editing UI
-- is feature-flagged OFF and Fotello does all editing in its own app.
-- The platform keeps intake, custody, review, and delivery.
--
-- 1. ai_editing_enabled — hides the merge/enhance stages in PhotoManager
--    and stops all UI-triggered AI jobs. Flip to true to bring the tools
--    back; no code change needed. (Engine development continues on
--    branches regardless of this flag.)
-- 2. Dropbox RAW intake — contractor photographers upload RAWs through a
--    per-order Dropbox file request (no Dropbox account needed on their
--    side). The order stores the request link + destination folder.
-- =============================================================

alter table business_settings
  add column if not exists ai_editing_enabled boolean not null default false;

comment on column business_settings.ai_editing_enabled is
  'Show the in-platform merge/AI-enhance tools. OFF while Fotello is the interim editor (docs/WORKFLOW_FOTELLO_EDIT_LOOP.md).';

alter table orders
  add column if not exists dropbox_intake_url text,
  add column if not exists dropbox_intake_path text;

comment on column orders.dropbox_intake_url is
  'Dropbox file-request link sent to the contractor photographer for RAW upload.';
comment on column orders.dropbox_intake_path is
  'Dropbox folder the file request delivers into (synced to the office Mac).';
