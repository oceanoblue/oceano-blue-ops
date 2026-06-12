/**
 * Room / area taxonomy for listing photos.
 *
 * A single source of truth shared by the vision classifier (lib/ai/room-classify),
 * the classify API route, the Review grid, and the client gallery. Keeping the
 * canonical ids + display labels + grouping order here means the model, the
 * database, and every UI agree on the same vocabulary.
 *
 * Ids are stable snake_case strings stored verbatim in photos.room_type. The
 * display order below is the order rooms appear when a gallery is grouped — it
 * roughly follows how a buyer walks a property: arrive out front, move through
 * the public living spaces, then private rooms, then outdoor/utility.
 */
export const ROOM_TYPES = [
  'exterior_front',
  'exterior_back',
  'aerial',
  'entryway',
  'living_room',
  'family_room',
  'great_room',
  'kitchen',
  'dining_room',
  'breakfast_nook',
  'home_office',
  'primary_bedroom',
  'bedroom',
  'primary_bathroom',
  'bathroom',
  'powder_room',
  'closet',
  'laundry_room',
  'hallway',
  'staircase',
  'bonus_room',
  'media_room',
  'gym',
  'basement',
  'garage',
  'patio_deck',
  'pool',
  'yard',
  'view',
  'detail',
  'other',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

const ROOM_SET = new Set<string>(ROOM_TYPES);

/** Human-friendly labels for section headers and badges. */
export const ROOM_LABELS: Record<RoomType, string> = {
  exterior_front: 'Exterior — Front',
  exterior_back: 'Exterior — Back',
  aerial: 'Aerial',
  entryway: 'Entryway',
  living_room: 'Living Room',
  family_room: 'Family Room',
  great_room: 'Great Room',
  kitchen: 'Kitchen',
  dining_room: 'Dining Room',
  breakfast_nook: 'Breakfast Nook',
  home_office: 'Home Office',
  primary_bedroom: 'Primary Bedroom',
  bedroom: 'Bedroom',
  primary_bathroom: 'Primary Bathroom',
  bathroom: 'Bathroom',
  powder_room: 'Powder Room',
  closet: 'Closet',
  laundry_room: 'Laundry Room',
  hallway: 'Hallway',
  staircase: 'Staircase',
  bonus_room: 'Bonus Room',
  media_room: 'Media Room',
  gym: 'Gym',
  basement: 'Basement',
  garage: 'Garage',
  patio_deck: 'Patio / Deck',
  pool: 'Pool',
  yard: 'Yard',
  view: 'View',
  detail: 'Detail',
  other: 'Other',
};

/** Index of each room in display order, for sorting groups. */
const ROOM_ORDER: Record<string, number> = Object.fromEntries(
  ROOM_TYPES.map((r, i) => [r, i])
);

/** Narrow an arbitrary string (e.g. a model response) to a known RoomType. */
export function normalizeRoomType(value: string | null | undefined): RoomType | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROOM_SET.has(v) ? (v as RoomType) : null;
}

/** Display label for a stored room_type, tolerant of unknown / null values. */
export function roomLabel(value: string | null | undefined): string {
  const r = normalizeRoomType(value);
  return r ? ROOM_LABELS[r] : 'Unsorted';
}

export interface RoomGroup<T> {
  roomType: RoomType | null; // null = not yet classified
  label: string;
  photos: T[];
}

/**
 * Group an ordered list of photos by room_type, preserving each photo's
 * relative order within its group and ordering the groups by ROOM_ORDER.
 * Unclassified photos collect into a trailing "Unsorted" group.
 */
export function groupByRoom<T extends { room_type?: string | null }>(
  photos: T[]
): RoomGroup<T>[] {
  const groups = new Map<string, RoomGroup<T>>();
  const UNSORTED = '__unsorted__';

  for (const p of photos) {
    const room = normalizeRoomType(p.room_type);
    const key = room ?? UNSORTED;
    let g = groups.get(key);
    if (!g) {
      g = { roomType: room, label: room ? ROOM_LABELS[room] : 'Unsorted', photos: [] };
      groups.set(key, g);
    }
    g.photos.push(p);
  }

  return Array.from(groups.values()).sort((a, b) => {
    // Unsorted always last.
    if (a.roomType === null) return 1;
    if (b.roomType === null) return -1;
    return (ROOM_ORDER[a.roomType] ?? 999) - (ROOM_ORDER[b.roomType] ?? 999);
  });
}
