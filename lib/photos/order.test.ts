import { describe, expect, it } from 'vitest';
import { captureTime, deliveryFilename, orderPhotos, photoOrderMetadata, type OrderablePhoto } from './order';
const photo = (id: string, filename: string, extra: Partial<OrderablePhoto> = {}) => ({ id, filename, ...extra });
describe('gallery ordering', () => {
  it('sorts camera numbers naturally, ignoring random upload prefixes', () => {
    const photos = [photo('a', '096ada96-9eb3-4807-ac1b-0a1e619c58df-Photo10.jpg'), photo('b', 'Photo2.jpg'), photo('c', 'Photo1.jpg')];
    expect(orderPhotos(photos, 'filename').map(p => p.id)).toEqual(['c', 'b', 'a']);
    expect(photos[0].id).toBe('a');
  });
  it('uses camera dates and filenames through multiple enhancement generations', () => {
    const photos = [photo('edit', 'random-result.jpg', { parent_photo_id: 'merge' }), photo('merge', 'hdr.jpg', { parent_photo_id: 'raw' }), photo('raw', 'DSC2.ARW', { exif: { DateTimeOriginal: '2026:09:16 09:00:00' } })];
    expect(photoOrderMetadata(photos[0], new Map(photos.map(p => [p.id, p])))).toEqual({filename:'DSC2.ARW', captured:Date.parse('2026-09-16T09:00:00Z')});
  });
  it('puts missing/invalid dates last, with deterministic natural-number tie breaks', () => {
    const photos = [photo('missing10', '10.jpg'), photo('late', '2.jpg', { exif: {DateTimeOriginal:'2026-09-17T10:00:00Z'} }), photo('early', '3.jpg', { exif: {DateTimeOriginal:'2026:09:16 10:00:00'} }), photo('missing2', '2.jpg', { exif: {DateTimeOriginal:'bad'} })];
    expect(orderPhotos(photos, 'captured').map(p => p.id)).toEqual(['early', 'late', 'missing2', 'missing10']);
  });
  it('handles missing parents and cycles without hanging or dropping photos', () => {
    const photos = [photo('a', '1.jpg', {parent_photo_id:'b'}), photo('b', '2.jpg', {parent_photo_id:'a'}), photo('c', '3.jpg', {parent_photo_id:'missing'})];
    expect(orderPhotos(photos, 'captured')).toHaveLength(3);
  });
  it('handles timezone offsets and rejects empty or non-string dates', () => {
    expect(captureTime({DateTimeOriginal:'2026-09-16T09:00:00-04:00'})).toBe(Date.parse('2026-09-16T13:00:00Z'));
    expect(captureTime({DateTimeOriginal:42})).toBeNull();
    expect(captureTime({DateTimeOriginal:''})).toBeNull();
  });
  it('makes ZIP names unique, padded, path-safe and ordered even with duplicate source names', () => {
    expect(deliveryFilename('same.jpg',0,20)).toBe('001-same.jpg');
    expect(deliveryFilename('same.jpg',1,20)).toBe('002-same.jpg');
    expect(deliveryFilename('../folder\\evil.jpg',9,1000)).toBe('0010-_folder_evil.jpg');
  });
});
