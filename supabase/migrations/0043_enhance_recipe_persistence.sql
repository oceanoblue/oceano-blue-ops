-- 0043_enhance_recipe_persistence.sql
-- Make every AI edit reproducible.
--
-- Until now a processed photo only recorded the free-text `ai_prompt` that the
-- model received. The structured choices that produced it — job type, provider,
-- and the enhance directives (sky style, enhancement style, window pull,
-- perspective, reflections, face blur, extra notes) — were used to BUILD the
-- prompt and then discarded. So an edit could not be re-run, tweaked, or applied
-- consistently to other frames; you couldn't even see how a given delivered
-- photo was made.
--
-- This adds:
--   * photos.source_job_id  -> ai_jobs(id)  — lineage from each output to the
--       exact job (and therefore inputs + recipe) that produced it.
--   * photos.ai_recipe jsonb — a self-contained, denormalized copy of the recipe
--       { job_type, provider, directives, prompt_extra, prompt } so the edit
--       stays reproducible even if the job row is ever pruned.
--
-- Additive + idempotent. No backfill (existing rows keep ai_prompt; new edits
-- carry the full recipe going forward).

begin;

alter table photos
  add column if not exists source_job_id uuid references ai_jobs(id) on delete set null,
  add column if not exists ai_recipe jsonb;

-- Lineage lookups (output -> producing job) and "find everything this job made".
create index if not exists idx_photos_source_job_id
  on photos(source_job_id)
  where source_job_id is not null;

comment on column photos.source_job_id is
  'The ai_jobs row that produced this photo (recipe + original inputs). Null for uploads/manual rows.';
comment on column photos.ai_recipe is
  'Self-contained reproducible recipe: { job_type, provider, directives, prompt_extra, prompt }.';

commit;
