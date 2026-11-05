import { editDb,editJson } from '@/lib/gallery-edits/server';
import { recoverGalleryEdits,runGalleryEdit } from '@/lib/gallery-edits/runner';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request: Request) {
  if(!process.env.CRON_SECRET || request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`) return editJson({error:'unauthorized'},401);
  const recovered=await recoverGalleryEdits();
  const {data,error}=await editDb().from('gallery_edits').select('id').eq('status','queued').order('created_at').limit(2);
  if(error) return editJson({error:'Queue unavailable.'},503);
  await Promise.all((data??[]).map((row:{id:string})=>runGalleryEdit(row.id)));
  return editJson({recovered,checked:data?.length??0});
}
