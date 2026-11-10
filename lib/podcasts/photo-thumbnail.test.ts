import { expect, it } from 'vitest';
import sharp from 'sharp';
import { composePhotoThumbnail, photoSourceUrl, photoThumbnailText } from './photo-thumbnail';
it('accepts original frames and rejects generated thumbnails and arbitrary destinations',()=>{
 expect(photoSourceUrl('https://i.ytimg.com/vi/sftv9dHYaek/maxres2.jpg')).toContain('maxres2');
 expect(photoSourceUrl('https://www.dropbox.com/scl/fi/a/photo.jpg?dl=0')).toContain('dl.dropboxusercontent.com');
 for(const url of ['http://i.ytimg.com/vi/sftv9dHYaek/maxres2.jpg','https://i.ytimg.com/vi/sftv9dHYaek/maxresdefault.jpg','https://127.0.0.1/photo.jpg','https://evil.example/photo.jpg','https://user:pass@www.dropbox.com/photo.jpg'])expect(()=>photoSourceUrl(url)).toThrow();
});
it('uses the episode title verbatim for identity and topic',()=>{
 expect(photoThumbnailText('Dr. Patrick Wiita on ADHD, Anxiety and Child Psychiatry')).toEqual({guest:'Dr. Patrick Wiita',lines:['ADHD, Anxiety and Child Psychiatry']});
});
it('preserves a photographic panel without repainting or distortion',async()=>{
 const raw=Buffer.alloc(608*342*3);
 for(let y=0;y<342;y++)for(let x=0;x<608;x++){const p=(y*608+x)*3;raw[p]=x%256;raw[p+1]=y%256;raw[p+2]=(x+y)%256;}
 const photo=await sharp(raw,{raw:{width:608,height:342,channels:3}}).png().toBuffer();
 const result=await composePhotoThumbnail(photo,photo,'Dr. Patrick Wiita on ADHD');
 const meta=await sharp(result).metadata();expect(meta).toMatchObject({width:1280,height:720,format:'jpeg'});
 const panel=await sharp(result).extract({left:24,top:230,width:608,height:342}).removeAlpha().raw().toBuffer();
 const error=panel.reduce((sum,n,i)=>sum+Math.abs(n-raw[i]),0)/raw.length;
 expect(error).toBeLessThan(3); // Only bounded JPEG encoding loss, no synthesized content.
});
