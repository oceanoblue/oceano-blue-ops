import { expect, it, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { thumbnailReady } from './thumbnail-state';
vi.mock('@/lib/podcasts/youtube',()=>({youtubeToken:vi.fn(async()=>({token:'test',channelId:'our-channel'})),youtubeRequest:vi.fn()}));
import { applyYoutubeThumbnail, thumbnailJpeg } from './thumbnail';
import { youtubeRequest } from './youtube';
afterEach(()=>vi.clearAllMocks());
it('requires completed art for the exact linked video',()=>{
  expect(thumbnailReady(null,'abcdefghijk')).toBe(false);
  expect(thumbnailReady({status:'generating',storage_path:'x',youtube_id:'abcdefghijk'},'abcdefghijk')).toBe(false);
  expect(thumbnailReady({status:'ready',storage_path:'x',youtube_id:'other-video'},'abcdefghijk')).toBe(false);
  expect(thumbnailReady({status:'ready',storage_path:'x',youtube_id:'abcdefghijk'},'abcdefghijk')).toBe(true);
});
it('stores a bounded widescreen JPEG and rejects invalid or portrait images',async()=>{
  const input=await sharp({create:{width:2048,height:1152,channels:3,background:'#fff'}}).png().toBuffer();
  const out=await thumbnailJpeg(input.toString('base64'));
  expect(await sharp(out).metadata()).toMatchObject({format:'jpeg',width:1280,height:720});
  expect(out.length).toBeLessThan(2_000_000);
  await expect(thumbnailJpeg('not an image')).rejects.toThrow();
  const portrait=await sharp({create:{width:720,height:1280,channels:3,background:'#fff'}}).png().toBuffer();
  await expect(thumbnailJpeg(portrait.toString('base64'))).rejects.toThrow('widescreen');
});
it('checks the channel before applying a thumbnail and never changes video visibility',async()=>{
  vi.mocked(youtubeRequest).mockResolvedValueOnce(Response.json({items:[{snippet:{channelId:'other'}}]}));
  await expect(applyYoutubeThumbnail({},'show','abcdefghijk',Buffer.from('image'))).rejects.toThrow('belongs');
  expect(youtubeRequest).toHaveBeenCalledTimes(1);
  vi.mocked(youtubeRequest).mockResolvedValueOnce(Response.json({items:[{snippet:{channelId:'our-channel'}}]})).mockResolvedValueOnce(Response.json({items:[{default:{url:'image'}}]}));
  await applyYoutubeThumbnail({},'show','abcdefghijk',Buffer.from('image'));
  expect(vi.mocked(youtubeRequest).mock.calls[2][0]).toContain('/thumbnails/set?videoId=abcdefghijk');
  expect(vi.mocked(youtubeRequest).mock.calls[2][2]?.method).toBe('POST');
});
