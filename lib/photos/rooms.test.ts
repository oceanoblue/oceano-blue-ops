import { describe, it, expect } from 'vitest';
import { normalizeRoomType, roomLabel, groupByRoom, ROOM_TYPES } from './rooms';

describe('normalizeRoomType', () => {
  it('accepts canonical ids', () => {
    expect(normalizeRoomType('living_room')).toBe('living_room');
    expect(normalizeRoomType('primary_bedroom')).toBe('primary_bedroom');
  });

  it('normalizes spacing, case, and hyphens from model output', () => {
    expect(normalizeRoomType('Living Room')).toBe('living_room');
    expect(normalizeRoomType('PRIMARY-BEDROOM')).toBe('primary_bedroom');
    expect(normalizeRoomType('  kitchen  ')).toBe('kitchen');
  });

  it('rejects unknown or empty values', () => {
    expect(normalizeRoomType('wine_cellar')).toBeNull();
    expect(normalizeRoomType('')).toBeNull();
    expect(normalizeRoomType(null)).toBeNull();
    expect(normalizeRoomType(undefined)).toBeNull();
  });
});

describe('roomLabel', () => {
  it('maps known ids to display labels', () => {
    expect(roomLabel('primary_bathroom')).toBe('Primary Bathroom');
    expect(roomLabel('patio_deck')).toBe('Patio / Deck');
  });

  it('falls back to Unsorted for unknown/null', () => {
    expect(roomLabel(null)).toBe('Unsorted');
    expect(roomLabel('nope')).toBe('Unsorted');
  });
});

describe('groupByRoom', () => {
  it('groups photos and orders groups by walkthrough order', () => {
    const photos = [
      { id: '1', room_type: 'kitchen' },
      { id: '2', room_type: 'exterior_front' },
      { id: '3', room_type: 'kitchen' },
      { id: '4', room_type: 'primary_bedroom' },
    ];
    const groups = groupByRoom(photos);
    // exterior_front precedes kitchen precedes primary_bedroom in ROOM_TYPES.
    expect(groups.map((g) => g.roomType)).toEqual([
      'exterior_front',
      'kitchen',
      'primary_bedroom',
    ]);
    // kitchen keeps both members in input order.
    expect(groups[1].photos.map((p) => p.id)).toEqual(['1', '3']);
  });

  it('collects unclassified photos into a trailing Unsorted group', () => {
    const photos = [
      { id: '1', room_type: null },
      { id: '2', room_type: 'kitchen' },
      { id: '3', room_type: undefined },
    ];
    const groups = groupByRoom(photos);
    expect(groups[0].roomType).toBe('kitchen');
    const last = groups[groups.length - 1];
    expect(last.roomType).toBeNull();
    expect(last.label).toBe('Unsorted');
    expect(last.photos.map((p) => p.id)).toEqual(['1', '3']);
  });

  it('has a label for every room type', () => {
    for (const r of ROOM_TYPES) {
      expect(roomLabel(r)).not.toBe('Unsorted');
    }
  });
});
