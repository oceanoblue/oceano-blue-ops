-- 0032_transistor_distribution.sql
-- Prepared 2026-06-11. OWNER APPLIES THIS via the manual db-migrate workflow.
--
-- Audio podcast distribution: each show can publish to YouTube (video) and/or
-- Transistor.fm (audio -> Spotify/Apple via RSS). Channel selection lives in
-- the existing publishing_platforms jsonb; this adds the Transistor show link.
-- Additive, idempotent.

alter table podcast_shows
  add column if not exists transistor_show_id text;  -- Transistor.fm show id this POS show maps to
