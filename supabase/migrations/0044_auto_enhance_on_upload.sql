-- 0044_auto_enhance_on_upload.sql
-- Auto-enhance on upload.
--
-- When enabled (the default), a deliverable base photo is enhanced automatically
-- once it's ready — no manual "Run AI" click:
--   • merged HDR bases  → enhanced server-side by the runner when the hdr_merge
--                          job completes (correct async timing; runs via cron).
--   • standalone JPEG singles → enhanced via /api/ai/auto-enhance, triggered when
--                          the photographer reaches Stage 2 (after triage).
-- Both paths are idempotent: a base is never enhanced twice.
--
-- Stored on the org-wide singleton business_settings so it has a single home and
-- the runner (which already reads this row for the booking buffer) can consult it.
-- Default true matches the chosen behavior; a settings toggle lets the team pause
-- it without SQL.
--
-- Additive + idempotent.

begin;

alter table business_settings
  add column if not exists auto_enhance_on_upload boolean not null default true;

comment on column business_settings.auto_enhance_on_upload is
  'When true, merged HDR bases and standalone JPEG singles are auto-enhanced (signature + scene auto-chain) once ready, without a manual Run AI click.';

commit;
