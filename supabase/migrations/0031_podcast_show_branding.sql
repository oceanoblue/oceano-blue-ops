-- 0031_podcast_show_branding.sql
-- Prepared 2026-06-10. OWNER APPLIES THIS — do not auto-merge/apply.
-- Apply via the manual db-migrate workflow (.github/workflows/db-migrate.yml), dry-run first.
--
-- Phase A of "manage podcasts entirely from POS": add per-show branding so a
-- producer can set a show's mood/voice, brand color and logo in the dashboard.
-- These feed the AI copy step (mood/voice) and the UI (logo/color). Additive,
-- idempotent, no data changes.

alter table podcast_shows
  add column if not exists brand_color text,        -- hex like #1e88e5, drives UI accents
  add column if not exists logo_url text,           -- public-assets storage path / public URL
  add column if not exists mood text,               -- short vibe descriptor (e.g. "warm, candid, upbeat")
  add column if not exists tone text,               -- writing voice for AI copy (e.g. "expert but friendly")
  add column if not exists tagline text;            -- one-line show tagline

-- (visual_style, audio_style, intro_rules, outro_rules, hosts, description,
--  default_language already exist from 0019 and are reused by the same form.)
