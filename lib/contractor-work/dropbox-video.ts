// Isolated from photo intake: no changes to its token cache, folder roots or processors.
import { isDropboxConfigured } from '@/lib/integrations/dropbox';
import type { IntakeFile } from './types';
let cached:{token:string;expires:number}|null=null;
let member:string|undefined;
const API='https://api.dropboxapi.com/2/';
export function videoIntakePath(id:string,title:string):string {
  if(!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid intake ID.');
  const root=('/'+(process.env.DROPBOX_VIDEO_INTAKE_ROOT||'/Video Intake')).replace(/\/+/g,'/').replace(/\/$/,'');
  const photo=('/'+(process.env.DROPBOX_PHOTO_INTAKE_ROOT||'/Photo Intake')).replace(/\/+/g,'/').replace(/\/$/,'').toLowerCase();
  if(!root || root.split('/').includes('..') || root.toLowerCase()===photo || root.toLowerCase().startsWith(photo+'/')) throw new Error('Video intake must use a separate Dropbox root.');
  const slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
  return `${root}/vi-${id}${slug?'-'+slug:''}`;
}
async function accessToken():Promise<string> {
  if(!isDropboxConfigured()) throw new Error('Dropbox is not configured.');
  if(cached && cached.expires>Date.now()) return cached.token;
  const r=await fetch('https://api.dropbox.com/oauth2/token',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Basic ${Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:process.env.DROPBOX_REFRESH_TOKEN!})});
  if(!r.ok) throw new Error('Dropbox authorization failed. Ask the office to check its integration.');
  const d=await r.json() as {access_token?:string;expires_in?:number}; if(!d.access_token) throw new Error('Dropbox authorization failed.');
  cached={token:d.access_token,expires:Date.now()+Math.max(60,(d.expires_in??14400)-300)*1000}; return cached.token;
}
async function call(endpoint:string,body:unknown):Promise<Response> {
  const token=await accessToken();
  const send=(extra:Record<string,string>={})=>fetch(API+endpoint,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(member?{'Dropbox-API-Select-User':member}:{}),...extra},body:JSON.stringify(body)});
  let r=await send();
  if(r.status===400 && (await r.clone().text()).includes('entire Dropbox Business team')) {
    const members=await fetch(API+'team/members/list_v2',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({limit:100})});
    if(!members.ok) throw new Error('Dropbox team authorization is unavailable.');
    const data=await members.json() as {members?:{profile?:{email?:string;team_member_id?:string;status?:{'.tag'?:string}}}[]};
    const active=(data.members??[]).map(m=>m.profile).filter(p=>p?.team_member_id && (p.status?.['.tag']??'active')==='active');
    const wanted=process.env.DROPBOX_TEAM_MEMBER_EMAIL?.toLowerCase();
    const found=wanted?active.find(p=>p?.email?.toLowerCase()===wanted):active.length===1?active[0]:null;
    if(!found?.team_member_id) throw new Error('Ask the office to configure its Dropbox team member.');
    member=found.team_member_id; r=await send();
  }
  if(r.status===409 && (await r.clone().text()).includes('path/not_found')) {
    const account=await fetch(API+'users/get_current_account',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,...(member?{'Dropbox-API-Select-User':member}:{})}});
    if(account.ok) {
      const d=await account.json() as {root_info?:{root_namespace_id?:string;home_namespace_id?:string}};
      const ri=d.root_info;
      if(ri?.root_namespace_id && ri.root_namespace_id!==ri.home_namespace_id) {
        const retry=await send({'Dropbox-API-Path-Root':JSON.stringify({'.tag':'root',root:ri.root_namespace_id})});
        if(!(retry.status===400 && (await retry.clone().text()).includes('path root is not supported'))) r=retry;
      }
    }
  }
  return r;
}
export async function createVideoRequest(path:string,title:string):Promise<{id:string;url:string}> {
  const folder=await call('files/create_folder_v2',{path,autorename:false});
  if(!folder.ok) {
    const detail=await folder.text();
    if(!(folder.status===409 && detail.includes('conflict') && detail.includes('folder'))) throw new Error('Dropbox could not prepare the video folder.');
  }
  const r=await call('file_requests/create',{title:`Original footage: ${title} (Oceano Blue)`.slice(0,200),destination:path,open:true});
  if(!r.ok) throw new Error('Dropbox could not create the upload request.');
  const d=await r.json() as {id?:string;url?:string};
  if(!d.id || !d.url || !/^https:\/\/(www\.)?dropbox\.com\/request\//.test(d.url)) throw new Error('Dropbox returned an invalid upload link.');
  return {id:d.id,url:d.url};
}
export async function closeVideoRequest(id:string):Promise<void> { const r=await call('file_requests/update',{id,open:false});if(!r.ok) throw new Error('Dropbox could not close this upload request. Please retry before finalizing.'); }
export async function inspectVideoFolder(path:string):Promise<{files:IntakeFile[];count:number;bytes:number}> {
  let r=await call('files/list_folder',{path,recursive:true,limit:2000});
  const files:IntakeFile[]=[];
  for(let page=0;page<20;page++) {
    if(!r.ok) throw new Error('The complete Dropbox upload could not be verified. Retry Check uploads.');
    const data=await r.json() as {entries?:{'.tag':string;name:string;path_display?:string;size?:number;content_hash?:string}[];has_more?:boolean;cursor?:string};
    for(const e of data.entries??[]) if(e['.tag']==='file') {
      const relative=e.path_display?.toLowerCase().startsWith(path.toLowerCase()+'/')?e.path_display.slice(path.length+1):e.name;
      files.push({name:relative,size:e.size??0,...(e.content_hash?{content_hash:e.content_hash}:{})});
    }
    if(!data.has_more) return {files,count:files.length,bytes:files.reduce((sum,f)=>sum+f.size,0)};
    if(!data.cursor) throw new Error('Dropbox returned an incomplete file listing.');
    r=await call('files/list_folder/continue',{cursor:data.cursor});
  }
  throw new Error('This handoff is too large to verify in one scan. Ask the office to split it into smaller intakes.');
}
