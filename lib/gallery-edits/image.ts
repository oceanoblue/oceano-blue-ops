import sharp from 'sharp';
import type { EditInput } from './schema';

/** Exact preservation outside the chosen rectangle, in the normalized source.
 * Generated variants are separate 2K derivatives, never replacements for masters. */
export async function prepareSource(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}
export async function finishVariant(source: Buffer, generated: Buffer, input: EditInput) {
  const meta = await sharp(source).metadata();
  const width = meta.width!, height = meta.height!;
  const resultMeta = await sharp(generated, { limitInputPixels: 20_000_000 }).metadata();
  if (!resultMeta.width || !resultMeta.height || Math.abs((resultMeta.width/resultMeta.height)/(width/height)-1)>0.03) throw new Error('invalid_output');
  const normalized = await sharp(generated).resize(width, height, { fit: 'fill' }).toBuffer();
  let combined: Buffer;
  if (input.operation === 'declutter') {
    const a = input.options.area;
    const left = Math.round(a.x * width), top = Math.round(a.y * height);
    const patch = await sharp(normalized).extract({ left, top, width: Math.min(Math.round(a.width*width),width-left), height: Math.min(Math.round(a.height*height),height-top) }).png().toBuffer();
    combined = await sharp(source).composite([{ input: patch, left, top }]).png().toBuffer();
  } else combined = normalized;
  const text = input.operation === 'virtual_stage' ? 'VIRTUALLY STAGED' : 'DIGITALLY EDITED';
  const bar = Math.max(26, Math.round(height * 0.045));
  const label = Buffer.from(`<svg width="${width}" height="${bar}"><rect width="100%" height="100%" fill="#102c3b" fill-opacity="0.88"/><text x="16" y="${Math.round(bar*0.68)}" font-family="sans-serif" font-size="${Math.round(bar*0.48)}" fill="white">${text} · OCEANO BLUE MEDIA</text></svg>`);
  return sharp(combined).composite([{ input: label, gravity: 'south' }]).jpeg({ quality: 94 }).toBuffer();
}
