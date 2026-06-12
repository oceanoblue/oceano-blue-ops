-- 0035_photo_room_type.sql
-- AI room/area classification: tag each photo with which area of the property
-- it shows (living room, primary bedroom, kitchen, exterior, …) so the Review
-- grid and client gallery can group photos by room.
--
-- Additive + idempotent: two nullable columns on photos. room_type holds a
-- canonical snake_case id from lib/photos/rooms.ts (ROOM_TYPES); room_confidence
-- is the classifier's 0..1 score. NULL room_type = not yet classified.

alter table public.photos
  add column if not exists room_type text,
  add column if not exists room_confidence real;

-- Partial index: grouping/filtering only ever touches classified rows.
create index if not exists photos_room_type_idx
  on public.photos (order_id, room_type)
  where room_type is not null;

comment on column public.photos.room_type is
  'Canonical area id (lib/photos/rooms.ts ROOM_TYPES), e.g. living_room, primary_bedroom, kitchen. NULL = unclassified.';
comment on column public.photos.room_confidence is
  'Vision classifier confidence 0..1 for room_type.';
