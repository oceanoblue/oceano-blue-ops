import { after } from 'next/server';
import { editSchema } from '@/lib/gallery-edits/schema';
import { editAccess, editDb, editJson, limitEdits, providerAvailable, readSmallJson } from '@/lib/gallery-edits/server';
import { runGalleryEdit } from '@/lib/gallery-edits/runner';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
type Context = { params: Promise<{ token: string }> };
const publicFields = 'id, photo_id, operation, credits, status, created_at';

export async function GET(request: Request, context: Context) {
  const limited = await limitEdits(request,'read',60); if (limited) return limited;
  const {token} = await context.params;
  const access = await editAccess(token); if (access.error) return access.error;
  const db = editDb();
  const [account, edits, config] = await Promise.all([
    db.from('gallery_edit_accounts').select('remaining').eq('order_id',access.link!.order_id).maybeSingle(),
    db.from('gallery_edits').select(publicFields).eq('order_id',access.link!.order_id).order('created_at',{ascending:false}).limit(50),
    db.from('gallery_edit_settings').select('enabled').eq('id',true).single(),
  ]);
  if (account.error || edits.error || config.error) return editJson({error:'Photo edits are temporarily unavailable.'},503);
  return editJson({remaining:account.data?.remaining ?? 5,enabled:config.data.enabled && providerAvailable(),edits:edits.data ?? []});
}
export async function POST(request: Request, context: Context) {
  const limited = await limitEdits(request,'create',10); if (limited) return limited;
  const {token} = await context.params;
  const access = await editAccess(token); if (access.error) return access.error;
  const parsed = editSchema.safeParse(await readSmallJson(request));
  if (!parsed.success) return editJson({error:'Choose an available photo, editing option and valid area or style.'},400);
  if (!providerAvailable()) return editJson({error:'Photo edits are temporarily unavailable.'},503);
  const body = parsed.data;
  const {data,error} = await editDb().rpc('reserve_gallery_edit',{p_token:token,p_id:body.id,p_photo_id:body.photo_id,p_operation:body.operation,p_options:body.options});
  if (error) {
    const messages: Record<string,[string,number]> = {
      insufficient_credits:['You do not have enough credits. Contact us for additional edits.',409],
      edit_in_progress:['An edit is already in progress for this property. Please wait for its review.',409],
      request_conflict:['This request changed. Start a new edit.',409],
      photo_unavailable:['This photo is no longer available in your gallery.',404],
      gallery_unavailable:['This gallery is no longer available.',404],
      payment_required:['Complete payment to use photo edits.',402],
      editing_paused:['Photo editing is temporarily paused.',503],
      rate_limited:['Please wait 15 minutes before requesting another edit.',429],
      order_limit:['This property has reached its editing limit. Please contact us.',429],
      daily_limit:['Photo editing has reached today’s capacity. Please try tomorrow.',429],
    };
    const match = Object.entries(messages).find(([key])=>error.message?.includes(key));
    return editJson({error:match?.[1][0] ?? 'Unable to reserve this edit. Please retry the same request.'},match?.[1][1] ?? 503);
  }
  if (data.status === 'queued') after(()=>runGalleryEdit(data.id));
  return editJson({id:data.id,status:data.status},data.replay?200:202);
}
