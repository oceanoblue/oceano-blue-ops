import sharp from 'sharp';
import { youtubeRequest, youtubeToken } from '@/lib/podcasts/youtube';

export async function thumbnailJpeg(base64: string): Promise<Buffer> {
  const input = Buffer.from(base64, 'base64');
  const image = sharp(input, { limitInputPixels: 20_000_000, failOn: 'error' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height || meta.width < 640 || meta.height < 360 || Math.abs(meta.width / meta.height - 16 / 9) > 0.05) {
    throw new Error('Thumbnail must be a widescreen image at least 640 by 360 pixels.');
  }
  return image.resize(1280, 720).jpeg({ quality: 90 }).toBuffer();
}

export async function applyYoutubeThumbnail(admin: any, showId: string, videoId: string, bytes: Buffer) {
  const { token, channelId } = await youtubeToken(admin, showId);
  const current = await youtubeRequest(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`, token);
  if (!current.ok || (await current.json()).items?.[0]?.snippet?.channelId !== channelId) {
    throw new Error('Could not verify the video belongs to this show’s connected YouTube channel.');
  }
  const response = await youtubeRequest(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, token, {
    method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: new Uint8Array(bytes),
  });
  if (!response.ok || !(await response.json()).items?.length) {
    throw new Error(`YouTube did not accept the thumbnail (${response.status}). Check custom thumbnail access in YouTube Studio.`);
  }
}
