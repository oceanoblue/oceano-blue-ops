-- Allow RAW photo uploads (ARW / CR2 / CR3 / NEF / DNG / RAF / RW2 / ORF).
-- Most browsers report these as application/octet-stream because they don't
-- have a registered MIME, so we relax the raw-photos bucket to accept that.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/octet-stream'
]
where id = 'raw-photos';
