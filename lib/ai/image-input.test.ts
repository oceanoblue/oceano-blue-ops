import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { fitImageInput, IMAGE_INPUT_MAX_BYTES } from './image-input';

it('preserves images that already fit byte-for-byte', async () => {
  const bytes = await sharp({ create: { width: 100, height: 80, channels: 3, background: 'white' } }).jpeg().toBuffer();
  const output = await fitImageInput(bytes, 'house.jpg', 'image/jpeg');
  expect(output.bytes).toBe(bytes);
  expect(output.filename).toBe('house.jpg');
  expect(output.mimeType).toBe('image/jpeg');
});
it('fits a detailed image above 50 MB without changing its aspect ratio', async () => {
  const bytes = await sharp(randomBytes(4500 * 4000 * 3), { raw: { width: 4500, height: 4000, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  expect(bytes.length).toBeGreaterThan(50_000_000);
  const output = await fitImageInput(bytes, 'house.png', 'image/png');
  expect(output.bytes.length).toBeLessThanOrEqual(IMAGE_INPUT_MAX_BYTES);
  const meta = await sharp(output.bytes).metadata();
  expect(meta.format).toBe('png');
  expect(meta.width! / meta.height!).toBeCloseTo(4500 / 4000, 2);
  expect(meta.width).toBeLessThanOrEqual(4500);
}, 30000);
