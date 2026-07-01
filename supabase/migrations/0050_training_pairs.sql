-- 0050_training_pairs.sql
-- Captures (original, generative-AI-enhanced) photo pairs — a bootstrap
-- dataset for a possible future distilled/custom tone-mapping model, so we
-- aren't starting from zero data if that path is ever pursued.
--
-- Written by lib/ai/runner.ts whenever a NON-deterministic provider (GPT
-- Image, Nano Banana, …) completes an enhance job — never for our own
-- deterministic engine (oceano-enhance), since that's math we already know,
-- not a target to learn.
--
-- bucket/path columns are DENORMALIZED SNAPSHOTS, not just FKs: RAW cleanup
-- only ever deletes RAW-extension files (never the JPEGs a generative job
-- actually reads), but an order can still be deleted outright, and a training
-- row should stay usable/exportable even then. The FK columns are kept for
-- convenient joins (e.g. current approval status via photos.is_selected)
-- while the underlying rows are still alive.
--
-- Additive + idempotent.

begin;

create table if not exists training_pairs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  job_id uuid references ai_jobs(id) on delete set null,
  source_photo_id uuid references photos(id) on delete set null,
  output_photo_id uuid references photos(id) on delete set null,
  provider text not null,
  job_type text not null,
  project_type text,
  source_bucket text not null,
  source_storage_path text not null,
  output_bucket text not null,
  output_storage_path text not null,
  -- The recipe/prompt that produced the output (same shape as photos.ai_recipe)
  -- so a captured pair is reproducible, not just a picture.
  recipe jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_training_pairs_order on training_pairs(order_id);
create index if not exists idx_training_pairs_provider on training_pairs(provider, created_at desc);

alter table training_pairs enable row level security;

do $$ begin
  create policy "team read training pairs" on training_pairs
    for select using (is_team_member());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "team write training pairs" on training_pairs
    for all using (is_team_member()) with check (is_team_member());
exception when duplicate_object then null; end $$;

commit;
