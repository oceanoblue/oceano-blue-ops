-- =============================================================
-- 0048 — Store the RAW original alongside the display preview
-- =============================================================
-- For RAW captures (.arw/.cr2/.nef/.dng/…) ingest uploads the camera's embedded
-- JPEG preview as `storage_path` (fast display; sharp/browser can decode it).
-- To process at true RAW quality, we now ALSO upload the RAW original and record
-- its path here. The enhance runner downloads `raw_storage_path` (when set) and
-- feeds the RAW to the deterministic edit engine (libraw/rawpy in worker-edit),
-- while all display/thumbnail paths keep using `storage_path` (the preview).
--
-- Same bucket as the preview (`raw-photos`); nullable — non-RAW and
-- preview-less uploads leave it NULL and behave exactly as before.
-- =============================================================

alter table public.photos
  add column if not exists raw_storage_path text;

comment on column public.photos.raw_storage_path is
  'Path (in the raw-photos bucket) to the untouched RAW original, when a JPEG '
  'preview was uploaded as storage_path for display. NULL = storage_path is the '
  'processing source.';
