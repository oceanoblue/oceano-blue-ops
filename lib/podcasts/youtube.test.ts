import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
vi.mock('@/lib/supabase/server',()=>({createAdminClient:vi.fn()}));
import { CHUNK_SIZE, uploadSessionUrl, uploadedOffset, videoMetadata, youtubeRequest } from './youtube';
import { readBounded, sourceRange } from './youtube-upload';
afterEach(()=>vi.unstubAllGlobals());

describe('resumable YouTube transfers',()=>{
  it('reads real HTTP 308 progress without following redirects or forwarding credentials',async()=>{
    const requests: string[] = [];
    const server = createServer((request,response)=>{
      requests.push(request.url || '');
      response.writeHead(308,{Range:'bytes=0-33554431',Location:'/must-not-follow'});
      response.end();
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test address');
      const response = await youtubeRequest(`http://127.0.0.1:${address.port}/upload`,'test-token',{
        method:'PUT',headers:{'Content-Length':'0','Content-Range':'bytes */5273486804'},
      });
      expect(response.status).toBe(308);
      expect(uploadedOffset(response.headers.get('range'),5273486804)).toBe(33554432);
      expect(requests).toEqual(['/upload']);
      await response.body?.cancel();
    } finally {
      await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
  });
  it('keeps drafts nonpublic and normalizes generated copy',()=>{
    const metadata=videoMetadata({title:'<Draft>',youtube_description:'One\\nTwo',tags:['a'.repeat(500),'b']},'original.mp4');
    expect(metadata.status.privacyStatus).toBe('unlisted');
    expect(metadata.snippet.title).toBe('Draft');
    expect(metadata.snippet.description).toBe('One\nTwo');
    expect(metadata.snippet.tags.join(',').length).toBeLessThan(500);
    expect(CHUNK_SIZE % (256*1024)).toBe(0);
  });
  it('resumes at the byte after YouTube’s confirmed range',()=>{
    expect(uploadedOffset('bytes=0-33554431',5273486804)).toBe(33554432);
    expect(uploadedOffset(null,5273486804)).toBe(0);
    expect(()=>uploadedOffset('bytes=10-20',100)).toThrow();
    expect(()=>uploadedOffset('bytes=0-200',100)).toThrow();
  });
  it('restricts upload sessions to the YouTube upload endpoint',()=>{
    expect(uploadSessionUrl('https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc')).toContain('upload_id');
    for(const url of ['http://www.googleapis.com/upload/youtube/v3/videos?upload_id=x','https://example.com/?upload_id=x','https://www.googleapis.com/other?upload_id=x'])expect(()=>uploadSessionUrl(url)).toThrow();
  });
  it('follows only Dropbox redirects and validates exact ranges',async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://dl.dropboxusercontent.com/file'}}))
      .mockResolvedValueOnce(new Response('abc',{status:206,headers:{'content-range':'bytes 3-5/10'}}));
    vi.stubGlobal('fetch',fetch);
    const chunk=await sourceRange('https://www.dropbox.com/file',3,5);
    expect((await readBounded(chunk.response,3)).toString()).toBe('abc');
    expect(fetch.mock.calls[1][1].headers.Range).toBe('bytes=3-5');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });
  it('blocks redirects to internal or unrelated hosts before fetching them',async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}}));
    vi.stubGlobal('fetch',fetch);
    await expect(sourceRange('https://www.dropbox.com/file',0,0)).rejects.toThrow('Dropbox video link');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects servers ignoring range requests and oversized or truncated chunks',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('whole file',{status:200})));
    await expect(sourceRange('https://www.dropbox.com/file',0,0)).rejects.toThrow('requested video bytes');
    await expect(readBounded(new Response('abcd'),3)).rejects.toThrow('more data');
    await expect(readBounded(new Response('ab'),3)).rejects.toThrow('interrupted');
  });
});
