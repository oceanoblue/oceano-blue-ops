import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ArchivePartLinks, verifiedDownloadFiles, type ReadyFile } from '@/components/gallery/PreparedPhotoDownload';

const file = (part: number, count = 2): ReadyFile => ({
  downloadUrl: `https://storage.test/part-${part}`, filename: `part-${part}.zip`, photoCount: count,
  bytes: 10000, verified: true, expiresAt: Date.now() + 60000,
});
it('accepts the existing single verified ZIP response', () => {
  const ready = file(1, 168);
  expect(verifiedDownloadFiles(ready, 168)).toEqual([ready]);
});
it('requires every part and the full photo count before offering downloads', () => {
  const downloads = [file(1), file(2)];
  const ready = { ...file(1, 4), downloadUrl: null, downloads };
  expect(verifiedDownloadFiles(ready, 4)).toHaveLength(2);
  expect(() => verifiedDownloadFiles({ ...ready, downloads: [file(1)] }, 4)).toThrow();
  expect(() => verifiedDownloadFiles({ ...ready, downloads: [file(1), { ...file(2), verified: false }] }, 4)).toThrow();
  expect(() => verifiedDownloadFiles({ ...ready, downloads: [file(1), { ...file(2), expiresAt: 0 }] }, 4)).toThrow();
  expect(() => verifiedDownloadFiles({ ...ready, downloads: [file(1), { ...file(2), downloadUrl: 'javascript:alert(1)' }] }, 4)).toThrow();
});
it('renders each part as its own ordinary downloadable ZIP without automatic multiple downloads', () => {
  const html = renderToStaticMarkup(createElement(ArchivePartLinks, { files: [file(1), file(2)] }));
  expect(html).toContain('ZIP 1 of 2'); expect(html).toContain('ZIP 2 of 2');
  expect(html).toContain('href="https://storage.test/part-1"');
  expect(html).toContain('href="https://storage.test/part-2"');
  expect(html).toContain('download="part-1.zip"'); expect(html).toContain('download="part-2.zip"');
  expect(html).toContain('each ZIP opens on its own');
});
