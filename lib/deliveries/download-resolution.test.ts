import sharp from 'sharp';
import { inflateRawSync } from 'node:zlib';
import { beforeEach, expect, it, vi } from 'vitest';
import { GET as download } from '@/app/api/delivery/[token]/download/route';
import { createAdminClient } from '@/lib/supabase/server';
import { photoDownloadUrl } from '@/components/gallery/PhotoDownloadControls';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
const storageDownload = vi.fn();
let rows: Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  rows = {
    delivery_links: { id: 'link', order_id: 'order', expires_at: null, download_count: 0 },
    orders: { total_cents: 10000, download_paid_at: '2026-09-30T12:00:00Z' },
    photos: [{ bucket: 'processed-photos', storage_path: 'master.jpg', filename: 'Photo.jpg', is_hdr: false, ai_provider: null }],
  };
  const from = (table: string) => {
    const q: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'update']) q[method] = () => q;
    q.single = async () => ({ data: rows[table], error: null });
    q.then = (resolve: any) => Promise.resolve({ data: rows[table], error: null }).then(resolve);
    return q;
  };
  vi.mocked(createAdminClient).mockReturnValue({ from, storage: { from: () => ({ download: storageDownload }) } } as any);
});

// Inspect the real, single-file ZIP emitted by the route without adding a ZIP
// dependency. Read sizes from the central directory (streaming ZIPs use data
// descriptors), then decompress the first entry from its local header offset.
function firstFile(zip: Buffer): { name: string; bytes: Buffer } {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  expect(zip.readUInt16LE(end + 10)).toBe(1);
  const central = zip.readUInt32LE(end + 16);
  expect(zip.readUInt32LE(central)).toBe(0x02014b50);
  const method = zip.readUInt16LE(central + 10);
  const size = zip.readUInt32LE(central + 20);
  const nameLength = zip.readUInt16LE(central + 28);
  const name = zip.subarray(central + 46, central + 46 + nameLength).toString('utf8');
  const local = zip.readUInt32LE(central + 42);
  expect(zip.readUInt32LE(local)).toBe(0x04034b50);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const compressed = zip.subarray(start, start + size);
  expect([0, 8]).toContain(method);
  return { name, bytes: method === 8 ? inflateRawSync(compressed) : compressed };
}

async function image(width: number, height: number) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: { r: 130, g: 160, b: 180 } } }).jpeg().toBuffer();
  storageDownload.mockResolvedValue({ data: new Blob([new Uint8Array(bytes)]) });
  return bytes;
}
const params = { params: Promise.resolve({ token: 'test-token' }) };

it.each([
  { size: 'web' as const, width: 4000, height: 2000, outWidth: 2048, outHeight: 1024 },
  { size: 'web' as const, width: 2000, height: 4000, outWidth: 1024, outHeight: 2048 },
  { size: 'web' as const, width: 1200, height: 800, outWidth: 1200, outHeight: 800 },
  { size: 'print' as const, width: 4000, height: 2000, outWidth: 3000, outHeight: 1500 },
])('delivers $size JPEGs at $outWidth x $outHeight from the selector URL', async ({ size, width, height, outWidth, outHeight }) => {
  await image(width, height);
  const response = await download(new Request(`https://example.test${photoDownloadUrl('test-token', size)}`), params);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/zip');
  expect(response.headers.get('content-disposition')).toContain(`-${size}.zip`);
  const file = firstFile(Buffer.from(await response.arrayBuffer()));
  expect(file.name).toContain(`-${size}.jpg`);
  const metadata = await sharp(file.bytes).metadata();
  expect(metadata.format).toBe('jpeg');
  expect(metadata.width).toBe(outWidth);
  expect(metadata.height).toBe(outHeight);
});

it('delivers the original bytes unchanged for Full resolution', async () => {
  const original = await image(4000, 2000);
  const response = await download(new Request(`https://example.test${photoDownloadUrl('test-token', 'full')}`), params);
  expect(response.status).toBe(200);
  const file = firstFile(Buffer.from(await response.arrayBuffer()));
  expect(file.bytes.equals(original)).toBe(true);
  expect(file.name).not.toContain('-web');
});

it.each(['full', 'print', 'web'] as const)('still refuses unpaid %s downloads', async size => {
  rows.orders.download_paid_at = null;
  const response = await download(new Request(`https://example.test${photoDownloadUrl('test-token', size)}`), params);
  expect(response.status).toBe(402);
  expect(storageDownload).not.toHaveBeenCalled();
});
