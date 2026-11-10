import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import { createElement as h, type CSSProperties } from 'react';
import { directDownloadUrl } from './episode-source';

// No generative image model is involved. Only original photographs enter these panels.
export function photoSourceUrl(value: string): string {
  const u=new URL(value);
  if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') ||
    !(u.hostname==='i.ytimg.com' || u.hostname==='dropbox.com' || u.hostname==='www.dropbox.com' || u.hostname.endsWith('.dropboxusercontent.com'))) {
    throw new Error('Thumbnail photos must come from Dropbox or YouTube video frames.');
  }
  if(u.hostname==='i.ytimg.com' && !/^\/vi\/[A-Za-z0-9_-]{11}\/(maxres|hq)[123]\.jpg$/.test(u.pathname)) throw new Error('Use an original video frame, not an existing generated thumbnail.');
  return directDownloadUrl(value) ?? u.toString();
}
export async function loadThumbnailPhoto(value:string):Promise<Buffer>{
  let url=photoSourceUrl(value);
  for(let i=0;i<6;i++){
    const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(res.status>=300 && res.status<400){
      const location=res.headers.get('location');await res.body?.cancel();
      if(!location)throw new Error('Photo redirect missing.');
      url=photoSourceUrl(new URL(location,url).toString());continue;
    }
    if(!res.ok || !res.body)throw new Error('Original thumbnail photo unavailable.');
    const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();throw new Error('Original photo is too large.');}chunks.push(value);}
    const bytes=Buffer.concat(chunks);
    const info=await sharp(bytes,{limitInputPixels:20_000_000}).metadata();
    if(!info.width || info.width<320 || !info.height || info.height<180)throw new Error('Original photo resolution is too low.');
    return bytes;
  }
  throw new Error('Too many photo redirects.');
}
export function photoThumbnailText(title:string){
  const split=title.indexOf(' on ');
  const guest=split>0?title.slice(0,split):'';
  const topic=split>0?title.slice(split+4):title;
  const words=topic.split(/\s+/);const lines:string[]=[];
  for(const word of words){const last=lines.length-1;if(last>=0 && (lines[last]+' '+word).length<=42)lines[last]+=' '+word;else lines.push(word);}
  return {guest,lines:lines.slice(0,3).map((line,i)=>i===2 && lines.length>3?line+'…':line)};
}
export async function composePhotoThumbnail(hosts:Buffer,guest:Buffer,title:string):Promise<Buffer>{
  const text=photoThumbnailText(title);
  // ImageResponse embeds its bundled font as outlines, so Lambda needs no system fonts.
  const box=(style:CSSProperties, value?:string)=>h('div',{style:{display:'flex',position:'absolute',...style}},value);
  const base=new ImageResponse(h('div',{style:{display:'flex',width:1280,height:720,background:'#edf6fb',color:'#15204a'}},
    box({left:0,top:0,width:1280,height:56,background:'#15204a'}),
    box({left:32,top:14,fontSize:27,color:'white'},'MIND YOUR HEALTH PODCAST'),
    box({left:1024,top:0,width:256,height:56,background:'#e52e83'}),
    box({left:1054,top:15,fontSize:24,color:'white'},'NEW EPISODE'),
    ...text.lines.map((line,i)=>box({left:32,top:72+i*49,fontSize:44},line)),
    box({left:32,top:585,fontSize:23,color:'#475569'},'HOSTS · DR. DEBI LYNES & DR. DAVID BURKE'),
    box({left:656,top:585,fontSize:23,color:'#475569'},'FROM THIS EPISODE'),
    box({left:0,top:638,width:1280,height:82,background:'#15204a'}),
    box({left:32,top:656,fontSize:text.guest.length>45?28:38,color:'white'},text.guest?'WITH '+text.guest.toUpperCase():'MIND YOUR HEALTH')
  ),{width:1280,height:720});
  const background=Buffer.from(await base.arrayBuffer());
  const panel=async(bytes:Buffer)=>sharp(bytes,{limitInputPixels:20_000_000}).rotate().resize(608,342,{fit:'contain',background:'#15204a'}).png().toBuffer();
  const [hostPhoto,guestPhoto]=await Promise.all([panel(hosts),panel(guest)]);
  return sharp(background).composite([{input:hostPhoto,left:24,top:230},{input:guestPhoto,left:648,top:230}]).jpeg({quality:95}).toBuffer();
}
