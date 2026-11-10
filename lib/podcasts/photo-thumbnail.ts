import sharp from 'sharp';
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
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
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
  const heading=text.lines.map((line,i)=>`<text x="32" y="${110+i*49}" font-size="44" font-weight="700" fill="#15204a">${escape(line)}</text>`).join('');
  const svg=Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <rect width="1280" height="720" fill="#edf6fb"/><rect width="1280" height="56" fill="#15204a"/>
    <g font-family="Arial,DejaVu Sans,sans-serif"><text x="32" y="38" font-size="27" font-weight="700" fill="white">MIND YOUR HEALTH PODCAST</text>
    <rect x="1024" width="256" height="56" fill="#e52e83"/><text x="1054" y="37" font-size="24" font-weight="700" fill="white">NEW EPISODE</text>
    ${heading}<rect x="24" y="230" width="608" height="342" fill="#15204a"/><rect x="648" y="230" width="608" height="342" fill="#15204a"/>
    <text x="32" y="608" font-size="23" fill="#475569">HOSTS · DR. DEBI LYNES &amp; DR. DAVID BURKE</text>
    <text x="656" y="608" font-size="23" fill="#475569">FROM THIS EPISODE</text>
    <rect y="638" width="1280" height="82" fill="#15204a"/>
    <text x="32" y="691" font-size="${text.guest.length>45?28:38}" font-weight="700" fill="white">${escape(text.guest?'WITH '+text.guest.toUpperCase():'MIND YOUR HEALTH')}</text></g></svg>`);
  const panel=async(bytes:Buffer)=>sharp(bytes,{limitInputPixels:20_000_000}).rotate().resize(608,342,{fit:'contain',background:'#15204a'}).png().toBuffer();
  const [h,g]=await Promise.all([panel(hosts),panel(guest)]);
  return sharp(svg).composite([{input:h,left:24,top:230},{input:g,left:648,top:230}]).jpeg({quality:95}).toBuffer();
}
