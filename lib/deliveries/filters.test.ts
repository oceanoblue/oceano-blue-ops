import { describe, it, expect } from 'vitest';
import { parseDeliveryFilters, buildDeliveryQuery } from './filters';

describe('parseDeliveryFilters', () => {
  it('keeps known status and type values', () => {
    expect(parseDeliveryFilters({ status: 'approved', type: 'video_final' })).toEqual({
      status: 'approved',
      type: 'video_final',
      client: null,
    });
  });

  it('rejects unknown values, "all", and missing params', () => {
    expect(parseDeliveryFilters({ status: 'all', type: 'bogus' })).toEqual({ status: null, type: null, client: null });
    expect(parseDeliveryFilters({})).toEqual({ status: null, type: null, client: null });
    expect(parseDeliveryFilters(undefined)).toEqual({ status: null, type: null, client: null });
  });

  it('takes the first entry when a param repeats (array)', () => {
    expect(parseDeliveryFilters({ status: ['draft', 'approved'] })).toEqual({
      status: 'draft',
      type: null,
      client: null,
    });
  });

  it('keeps a client filter only when it is a uuid', () => {
    const id = 'a3c1b9be-12f0-4c5d-9a44-0d6f5f2b7e10';
    expect(parseDeliveryFilters({ client: id }).client).toBe(id);
    expect(parseDeliveryFilters({ client: 'not-a-uuid' }).client).toBeNull();
    expect(parseDeliveryFilters({ client: [id, id] }).client).toBe(id);
  });
});

describe('buildDeliveryQuery', () => {
  it('omits null/empty values and returns "" when nothing is set', () => {
    expect(buildDeliveryQuery({ status: null, type: null })).toBe('');
    expect(buildDeliveryQuery({})).toBe('');
  });

  it('serializes the active filters with a leading "?"', () => {
    expect(buildDeliveryQuery({ status: 'draft' })).toBe('?status=draft');
    expect(buildDeliveryQuery({ status: 'draft', type: 'photo_gallery' })).toBe('?status=draft&type=photo_gallery');
  });
});
