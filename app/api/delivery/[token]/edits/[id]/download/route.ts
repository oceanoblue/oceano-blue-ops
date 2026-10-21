import sharp from 'sharp';
import { editAccess,editDb,editJson,privateHeaders,limitEdits } from '@/lib/gallery-edits/server';
export const dynamic='force-dynamic';
export async function GET(request: Request, context: {params:Promise<{token:string;id:string}>}) {
  const limited = await limitEdits(request,'download',30); if(limited) return limited;
  const {token,id}=await context.params;
  const access=await editAccess(token); if(access.error) return access.error;
  const {data,error}=await editDb().from('gallery_edits').select('operation,output_path').eq('id',id).eq('order_id',access.link!.order_id).eq('status','approved').maybeSingle();
  if(error || !data?.output_path) return editJson({error:'Edit unavailable.'},404);
  const file=await editDb().storage.from('gallery-edits').download(data.output_path);
  if(file.error || !file.data) return editJson({error:'Download unavailable. Please retry.'},503);
  const web = new URL(request.url).searchParams.get('size')==='web';
  let bytes=Buffer.from(await file.data.arrayBuffer());
  if(web) {
    // Preserve disclosure label. Each MLS JPEG must stay below the existing 2 MB target.
    for(const quality of [85,75,60,45]) {
      bytes=Buffer.from(await sharp(Buffer.from(await file.data.arrayBuffer())).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).jpeg({quality}).toBuffer());
      if(bytes.length<2_000_000) break;
    }
    if(bytes.length>=2_000_000) return editJson({error:'Unable to prepare MLS size. Please contact us.'},503);
  }
  return new Response(new Uint8Array(bytes),{headers:{...privateHeaders,'Content-Type':'image/jpeg','Content-Disposition':`attachment; filename="${data.operation==='virtual_stage'?'virtually-staged':'digitally-edited'}-${id.slice(0,8)}${web?'-mls':''}.jpg"`}});
}
