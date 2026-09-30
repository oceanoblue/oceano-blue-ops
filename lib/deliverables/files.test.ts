import { expect, it, vi } from 'vitest';
import { signDeliverableFile } from './files';
import { createClient } from '@supabase/supabase-js';
it.each(['First floor.pdf', 'Second floor.jpg'])('uses the installed storage SDK to create preview and attachment URLs for %s', async filename => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ signedURL: '/object/sign/deliverables/listing/plan?token=test-only' }), { headers: { 'content-type': 'application/json' } }));
  const client = createClient('https://storage.test', 'test-key', { global: { fetch }, auth: { persistSession: false } });
  const links = await signDeliverableFile(client, { bucket: 'deliverables', storage_path: 'listing/plan', filename });
  expect(new URL(links.url!).searchParams.has('download')).toBe(false);
  expect(new URL(links.downloadUrl!).searchParams.get('download')).toBe(filename);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not substitute a preview when signing a download fails', async () => {
  const createSignedUrl = vi.fn().mockResolvedValueOnce({data:{signedUrl:'preview'}}).mockResolvedValueOnce({data:null,error:{message:'unavailable'}});
  const result = await signDeliverableFile({storage:{from:()=>({createSignedUrl})}} as any, {bucket:'deliverables',storage_path:'plan',filename:'plan.pdf'});
  expect(result).toEqual({url:'preview',downloadUrl:null});
});
