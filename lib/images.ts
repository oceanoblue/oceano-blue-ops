/**
 * Brand image library.
 *
 * These are AI-generated brand stills hosted on the generation CDN for this
 * first design pass. Once the direction is approved we migrate them to
 * self-hosted assets (Vercel Blob / Supabase Storage / the studio's own
 * photography) — see README in this folder.
 */
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_36ca965A2sxmebuie6PKNnGZzDJ';

export const IMAGES = {
  hero: `${CDN}/hf_20260606_120943_7b60ef34-3f15-48ce-91a4-13adb6315928.png`, // cinematographer, golden hour
  studio: `${CDN}/hf_20260606_122619_1f115dd8-13d8-4d45-83a6-5df6225d3d79.png`, // bright white-cyc studio (wide)
  studioDetail: `${CDN}/hf_20260606_122621_83c8643c-7f4f-41ec-8294-ecddaab3e831.jpeg`, // studio camera + softbox detail
  brandStill: `${CDN}/hf_20260606_120945_07dcc120-3296-456e-99d4-6a5a1ac64032.png`, // brand photography still life
  headshot: `${CDN}/hf_20260606_120948_0ad2e5d9-0500-4807-b7e1-6635d6f29f0a.png`, // editorial headshot
  podcast: `${CDN}/hf_20260606_120949_5f524227-6919-498c-8a21-f963ec85d285.png`, // podcast studio
  lowcountry: `${CDN}/hf_20260606_120951_ba7b4fe9-a067-4699-bbea-0198088ad932.png`, // aerial marsh
  interior: `${CDN}/hf_20260606_120155_4ab2af85-525e-4dde-adde-94fcaf03803d.png`, // bright living room
  twilightHome: `${CDN}/hf_20260606_120154_9cad0bb8-17ce-4ab1-91cd-95b1a444429f.png`, // twilight real estate
} as const;

export type ImageKey = keyof typeof IMAGES;

/** Real Oceano Blue photography pulled from the Webflow site asset library. */
const WFS = 'https://cdn.prod.website-files.com/69444682984a6f0201f004c9';
export const PHOTOS = {
  interview: `${WFS}/69e6cd3dbf084527c4c0381f_Screenshot%202026-04-20%20at%209.04.39%E2%80%AFPM.png`, // on-camera interview (video)
  team: `${WFS}/69e6cc24ad7209b2dc72a5a4_OBM02627.jpg`, // team group outdoors (photography)
  twilight: `${WFS}/69e6cde56b7b89e2267d10e4_OBM07703%23twilight.jpeg`, // twilight real estate
  gustavo: `${WFS}/69f90d2d466fe5ec2e776dac_Gustavo%201x1.png`, // Gustavo portrait
} as const;


/**
 * Cinematic background clips (AI-generated, MP4). Empty string falls back to a
 * still poster image in the component. Filled once the renders complete.
 */
export const VIDEOS = {
  showreel: `${CDN}/hf_20260606_122752_982a0705-272b-4e5b-96d9-54ad3d791a08.mp4`, // bright white-cyc studio pan
  hero: `${CDN}/hf_20260606_122209_48cdf09b-5343-4fe8-8c45-30f8a7bd1aa9.mp4`, // Lowcountry aerial drift
  marsh: `${CDN}/hf_20260606_122209_48cdf09b-5343-4fe8-8c45-30f8a7bd1aa9.mp4`, // Lowcountry aerial drift
  realEstate: `${CDN}/hf_20260606_002726_b5d0a4df-b64f-4399-9357-d16cc3a15ab3.mp4`, // twilight real-estate transition
  studioRoom: `${CDN}/hf_20260606_122752_982a0705-272b-4e5b-96d9-54ad3d791a08.mp4`, // studio pan
} as const;
