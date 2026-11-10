import { expect,it,vi } from 'vitest';
import sharp from 'sharp';
const m=vi.hoisted(()=>({edit:vi.fn()}));
vi.mock('openai',()=>({default:class {images={edit:m.edit};},toFile:async(bytes:Buffer,name:string)=>({bytes,name})}));
import {designedThumbnail} from './designed-thumbnail';
it('uses guest and host references with high input fidelity and produces a YouTube-sized draft',async()=>{
 const bytes=await sharp({create:{width:1536,height:1024,channels:3,background:'navy'}}).jpeg().toBuffer();
 m.edit.mockResolvedValueOnce({data:[{b64_json:bytes.toString('base64')}]});
 const out=await designedThumbnail(Buffer.from('hosts'),Buffer.from('guest'),'Joel Taylor on Healthcare','Hospital leadership');
 expect(m.edit.mock.calls[0][0]).toMatchObject({input_fidelity:'high',n:1});
 expect(m.edit.mock.calls[0][0].image.map((x:any)=>x.name)).toEqual(['guest.jpg','hosts.jpg']);
 expect(m.edit.mock.calls[0][0].prompt).toContain('Joel Taylor');
 expect(await sharp(out).metadata()).toMatchObject({width:1280,height:720,format:'jpeg'});
 m.edit.mockRejectedValueOnce(new Error('timeout'));
 await expect(designedThumbnail(bytes,bytes,'x','')).rejects.toThrow('timeout');
 expect(m.edit).toHaveBeenCalledTimes(2);
});
