-- =============================================================
-- Local Worker v1
-- =============================================================
-- The local_workers / worker_tasks tables already exist (migration 0021).
-- v1 only adds a display-friendly key prefix so the owner can identify which
-- API key belongs to which worker (the full key is shown once at registration
-- and only its SHA-256 hash is stored in api_key_hash).
-- Additive + idempotent.
-- =============================================================

alter table local_workers
  add column if not exists api_key_prefix text;
