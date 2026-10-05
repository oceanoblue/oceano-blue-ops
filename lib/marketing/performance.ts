import { z } from 'zod';
export const eventNames = ['page_view','video_start','video_25','video_50','video_75','video_100','photo_click','showing_click','phone_click','email_click'] as const;
export const attributionSchema = z.object({source:z.string().max(80).default('direct'),campaign:z.string().max(120).default('')});
export const eventSchema = attributionSchema.extend({event:z.enum(eventNames),session_id:z.string().uuid(),event_id:z.string().uuid()}).strict();
export const inquirySchema = attributionSchema.extend({name:z.string().trim().min(1).max(120),email:z.string().email().max(254),phone:z.string().trim().max(40).regex(/^[0-9+(). x-]*$/).default(''),message:z.string().trim().min(1).max(3000),consent:z.literal(true),website:z.string().max(200).default(''),submission_id:z.string().uuid()}).strict();
export function attribution(search: URLSearchParams, referrer='') {
 const tagged=search.get('utm_source');let host='';try{host=new URL(referrer).hostname.toLowerCase();}catch{}
 const source=tagged||(/(^|\.)instagram\.com$/.test(host)?'instagram':/(^|\.)(facebook\.com|fb\.com)$/.test(host)?'facebook':host?'referral':'direct');
 return {source:source.toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,80)||'direct',campaign:(search.get('utm_campaign')||'').slice(0,120)};
}
export function campaignLink(path:string,source:string) {const u=new URL(path,'https://app.oceanoblue.net');u.searchParams.set('utm_source',source);u.searchParams.set('utm_medium',source==='print'?'qr':source==='email'?'email':'social');u.searchParams.set('utm_campaign','property');return u.toString();}
export const emptyPerformance={counts:{} as Record<string,number>,sessions:0,daily:[] as {day:string;views:number}[],sources:[] as {source:string;views:number}[],inquiries:0};
