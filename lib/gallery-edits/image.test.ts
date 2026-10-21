import sharp from 'sharp';
import { expect,it } from 'vitest';
import { prepareSource,finishVariant } from './image';
import type { EditInput } from './schema';
const input:EditInput={id:'x',photo_id:'x',operation:'declutter',options:{area:{x:0.3,y:0.3,width:0.3,height:0.3}}};
it('keeps a whole-image model change inside the authorized area and adds a disclosure bar',async()=>{
 const source=await sharp({create:{width:600,height:400,channels:3,background:'#ffffff'}}).png().toBuffer();
 const generated=await sharp({create:{width:600,height:400,channels:3,background:'#000000'}}).png().toBuffer();
 const result=await finishVariant(source,generated,input);
 const {data,info}=await sharp(result).raw().toBuffer({resolveWithObject:true});
 const pixel=(x:number,y:number)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
 expect(pixel(20,20).every(n=>n>245)).toBe(true);
 expect(pixel(250,180).every(n=>n<10)).toBe(true);
 expect(pixel(580,180).every(n=>n>245)).toBe(true);
 expect(pixel(580,390).some(n=>n<150)).toBe(true);
});
it('normalizes large inputs without upscaling small originals; rejects changed framing ratio',async()=>{
 const src=await sharp({create:{width:3000,height:2000,channels:3,background:'#fff'}}).png().toBuffer();
 expect(await sharp(await prepareSource(src)).metadata()).toMatchObject({width:2048,height:1365});
 const wrong=await sharp({create:{width:100,height:300,channels:3,background:'#fff'}}).png().toBuffer();
 await expect(finishVariant(src,wrong,input)).rejects.toThrow('invalid_output');
});
