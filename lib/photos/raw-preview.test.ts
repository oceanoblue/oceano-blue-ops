import { describe, it, expect, vi } from 'vitest';
import { extractLargestEmbeddedJpeg, readRawExifTags, extractRawForUpload } from './raw-preview';

/** Build a minimal but structurally-valid JPEG: SOI, APP0(payload), SOS, entropy, EOI. */
function makeJpeg(payload: number, entropy: number): Uint8Array {
  const out: number[] = [0xff, 0xd8]; // SOI
  const appLen = payload + 2;
  out.push(0xff, 0xe0, (appLen >> 8) & 0xff, appLen & 0xff);
  for (let i = 0; i < payload; i++) out.push(0x20);
  out.push(0xff, 0xda, 0x00, 0x02); // SOS, length 2
  for (let i = 0; i < entropy; i++) out.push(0x00); // entropy (no 0xFF)
  out.push(0xff, 0xd9); // EOI
  return Uint8Array.from(out);
}

describe('extractLargestEmbeddedJpeg', () => {
  it('returns null when there is no embedded JPEG', () => {
    expect(extractLargestEmbeddedJpeg(Uint8Array.from([0, 1, 2, 3, 4, 5]))).toBeNull();
  });

  it('extracts a single embedded JPEG exactly', () => {
    const jpeg = makeJpeg(10, 20);
    const buf = Uint8Array.from([0xaa, 0xbb, ...jpeg, 0xcc, 0xdd]);
    const got = extractLargestEmbeddedJpeg(buf);
    expect(got).not.toBeNull();
    expect(Array.from(got!)).toEqual(Array.from(jpeg));
  });

  it('picks the largest JPEG (full preview over thumbnail)', () => {
    const thumb = makeJpeg(8, 8); // small
    const preview = makeJpeg(400, 600); // large
    // Order: thumbnail first, then the big preview, with filler between.
    const buf = Uint8Array.from([...thumb, 0x00, 0x00, ...preview]);
    const got = extractLargestEmbeddedJpeg(buf)!;
    expect(got.length).toBe(preview.length);
    expect(got[1]).toBe(0xd8);
    expect(got[got.length - 1]).toBe(0xd9);
  });

  it('is not fooled by a 0xFFD9 sitting inside the entropy stream', () => {
    // An EOI-looking pair preceded by a stuffed 0xFF00 must not end the scan.
    const out: number[] = [0xff, 0xd8, 0xff, 0xda, 0x00, 0x02];
    out.push(0xff, 0x00); // stuffed FF
    out.push(0x12, 0x34, 0x56); // entropy
    out.push(0xff, 0xd9); // real EOI
    const jpeg = Uint8Array.from(out);
    const got = extractLargestEmbeddedJpeg(jpeg)!;
    expect(got.length).toBe(jpeg.length);
  });
});

/** Build a little-endian TIFF header with Make/Model + Exif sub-IFD carrying
 *  ExposureBiasValue (SRATIONAL) and DateTimeOriginal. */
function makeTiff(evNum: number, evDen: number, dto: string): Uint8Array {
  const b = new Uint8Array(256);
  const dv = new DataView(b.buffer);
  // Header
  b[0] = 0x49; b[1] = 0x49; // "II" little-endian
  dv.setUint16(2, 0x2a, true);
  dv.setUint32(4, 8, true); // IFD0 at 8

  const setEntry = (off: number, tag: number, type: number, count: number, val: number) => {
    dv.setUint16(off, tag, true);
    dv.setUint16(off + 2, type, true);
    dv.setUint32(off + 4, count, true);
    dv.setUint32(off + 8, val, true);
  };
  const putAscii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
    b[off + s.length] = 0;
  };

  // IFD0: Make, Model, ExifIFD pointer
  dv.setUint16(8, 3, true);
  setEntry(10, 0x010f, 2, 5, 100); // Make → "SONY"
  setEntry(22, 0x0110, 2, 9, 110); // Model → "ILCE-7M4"
  setEntry(34, 0x8769, 4, 1, 60); // ExifIFD at 60
  dv.setUint32(46, 0, true); // no next IFD

  // Exif sub-IFD: ExposureBiasValue, DateTimeOriginal
  dv.setUint16(60, 2, true);
  setEntry(62, 0x9204, 10, 1, 120); // SRATIONAL at 120
  setEntry(74, 0x9003, 2, 20, 130); // DateTimeOriginal at 130
  dv.setUint32(86, 0, true);

  // Data
  putAscii(100, 'SONY');
  putAscii(110, 'ILCE-7M4');
  dv.setInt32(120, evNum, true);
  dv.setInt32(124, evDen, true);
  putAscii(130, dto);
  return b;
}

describe('readRawExifTags', () => {
  it('reads ExposureBiasValue, DateTimeOriginal, make and model', () => {
    const tiff = makeTiff(-2, 1, '2026:06:18 11:15:10');
    const t = readRawExifTags(tiff);
    expect(t.ExposureBiasValue).toBe(-2);
    expect(t.DateTimeOriginal).toBe('2026-06-18T11:15:10');
    expect(t.Make).toBe('SONY');
    expect(t.Model).toBe('ILCE-7M4');
  });

  it('handles fractional/third-stop bias', () => {
    const t = readRawExifTags(makeTiff(-1, 3, '2026:06:18 09:00:00'));
    expect(t.ExposureBiasValue).toBeCloseTo(-1 / 3, 5);
  });

  it('returns nulls on non-TIFF input', () => {
    const t = readRawExifTags(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]));
    expect(t.ExposureBiasValue).toBeNull();
    expect(t.DateTimeOriginal).toBeNull();
  });
});

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 8);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}
function cr3(...metadata: Uint8Array[]): Uint8Array {
  const uuid = Uint8Array.from('85c0b687820f11e08111f4ce462b6a48'.match(/../g)!.map(s => parseInt(s, 16)));
  return concat(box('ftyp', new TextEncoder().encode('crx     ')),
    box('moov', box('uuid', concat(uuid, ...metadata))));
}
function exposureTiff(): Uint8Array {
  const b = new Uint8Array(400), v = new DataView(b.buffer);
  b.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
  const tags: [number, number, number, number][] = [
    [0x829a, 5, 1, 160], [0x829d, 5, 1, 168], [0x8827, 3, 1, 100],
    [0x9204, 10, 1, 176], [0x920a, 5, 1, 184],
    [0x9003, 2, 20, 200], [0xa434, 2, 11, 224],
  ];
  v.setUint16(8, tags.length, true);
  tags.forEach(([tag, type, count, value], i) => {
    const pos = 10 + i * 12;
    v.setUint16(pos, tag, true); v.setUint16(pos + 2, type, true);
    v.setUint32(pos + 4, count, true); v.setUint32(pos + 8, value, true);
  });
  [[160, 6, 10], [168, 8, 1], [176, 0, 1], [184, 16, 1]].forEach(([o, n, d]) => {
    v.setUint32(o, n, true); v.setUint32(o + 4, d, true);
  });
  b.set(new TextEncoder().encode('2026:08:24 12:27:35\0'), 200);
  b.set(new TextEncoder().encode('16-35mm II\0'), 224);
  return b;
}

describe('Canon CR3 metadata', () => {
  it('merges camera CMT1 and exposure CMT2 TIFF roots without losing zero bias', () => {
    const tags = readRawExifTags(cr3(box('CMT1', makeTiff(0, 1, '2026:08:24 12:27:35')), box('CMT2', exposureTiff())));
    expect(tags).toMatchObject({ Make: 'SONY', Model: 'ILCE-7M4', ExposureBiasValue: 0,
      ExposureTime: 0.6, FNumber: 8, ISO: 100, FocalLength: 16, LensModel: '16-35mm II',
      DateTimeOriginal: '2026-08-24T12:27:35' });
  });

  it('does not read apparent metadata from image data or an unknown UUID', () => {
    expect(readRawExifTags(concat(box('ftyp', new TextEncoder().encode('crx     ')),
      box('mdat', box('CMT2', exposureTiff())))).ExposureTime).toBeUndefined();
    const bytes = cr3(box('CMT2', exposureTiff()));
    bytes[32] = 0; // first UUID byte
    expect(readRawExifTags(bytes).ExposureTime).toBeUndefined();
  });

  it('ignores truncated boxes and out-of-bounds TIFF value pointers', () => {
    const bytes = cr3(box('CMT2', exposureTiff()));
    expect(readRawExifTags(bytes.subarray(0, bytes.length - 1)).ExposureTime).toBeUndefined();
    const tiff = exposureTiff();
    new DataView(tiff.buffer).setUint32(18, 0xfffffffc, true);
    expect(readRawExifTags(cr3(box('CMT2', tiff))).ExposureTime).toBeUndefined();
  });

  it('extracts upload metadata from CR3 original without exifr or a preview', async () => {
    const { extractUploadExif } = await import('./exif-extract');
    const file = new File([cr3(box('CMT2', exposureTiff())).slice()], 'bracket.CR3');
    expect(await extractUploadExif(file)).toMatchObject({ ExposureBiasValue: 0, ExposureTime: 0.6, ISO: 100 });
  });
});


it('keeps CR3 metadata beside the normalized JPEG preview', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 4096, height: 2732, close() {} }));
  vi.stubGlobal('document', { createElement: () => ({
    getContext: () => ({ drawImage() {} }),
    toBlob: (done: (blob: Blob) => void) => done(new Blob(['normalized-preview'])),
  }) });
  try {
    const bytes = concat(cr3(box('CMT2', exposureTiff())), box('mdat', makeJpeg(10, 20)));
    const result = await extractRawForUpload(new File([bytes.slice()], 'capture.CR3'));
    expect(result?.file.name).toBe('capture.jpg');
    expect(result?.exif).toMatchObject({ ExposureTime: 0.6, ExposureBiasValue: 0, FNumber: 8, ISO: 100 });
  } finally {
    vi.unstubAllGlobals();
  }
});
