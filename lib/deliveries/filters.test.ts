import { describe, it, expect } from 'vitest';
import { parseDeliveryFilters, buildDeliveryQuery } from './filters';

describe('parseDeliveryFilters', () => {
  it('keeps known status and type values', () => {
    expect(parseDeliveryFilters({ status: 'approved', type: 'video_final' })).toEqual({
      status: 'approved',
      type: 'video_final',
    });
  });

  it('rejects unknown values, "all", and missing params', () => {
    expect(parseDeliveryFilters({ status: 'all', type: 'bogus' })).toEqual({ status: null, type: null });
    expect(parseDeliveryFilters({})).toEqual({ status: null, type: null });
    expect(parseDeliveryFilters(undefined)).toEqual({ status: null, type: null });
  });

  it('takes the first entry when a param repeats (array)', () => {
    expect(parseDeliveryFilters({ status: ['draft', 'approved'] })).toEqual({ status: 'draft', type: null });
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
