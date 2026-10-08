import { expect, it } from 'vitest';
import { verifiedDownloadFiles, type ReadyFile } from '@/components/gallery/PreparedPhotoDownload';
const ready: ReadyFile = { downloadUrl: 'https://app.test/download?archive=key', filename: 'photos.zip', photoCount: 168, bytes: 10000, verified: true, expiresAt: Date.now() + 60000 };
it('accepts one verified ZIP with every photo', () => expect(verifiedDownloadFiles(ready, 168)).toEqual([ready]));
it('rejects partial, expired, unsafe and multiple-file downloads', () => {
  for (const data of [{ ...ready, photoCount: 167 }, { ...ready, expiresAt: 0 }, { ...ready, verified: false }, { ...ready, downloadUrl: 'javascript:alert(1)' }, { ...ready, downloads: [{ ...ready, photoCount: 84 }, { ...ready, photoCount: 84 }] }]) {
    expect(() => verifiedDownloadFiles(data, 168)).toThrow();
  }
});
