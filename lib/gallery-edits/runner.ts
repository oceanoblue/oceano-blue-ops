import 'server-only';
import { editDb, providerAvailable } from './server';
import { editSchema } from './schema';
import { clientEditPrompt } from './prompts';
import { prepareSource, finishVariant } from './image';
import { openaiGptImage } from '@/lib/ai/openai-gpt-image';
import { paywallFor } from '@/lib/payments/gate';

export async function runGalleryEdit(id: string) {
  const db = editDb();
  // Compare-and-set is the only provider-call claim. A replay NEVER renders again.
  const { data: job, error } = await db.from('gallery_edits').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'queued').select('*').maybeSingle();
  if (error || !job) return;
  try {
    const input = editSchema.parse({ id: job.id, photo_id: job.photo_id, operation: job.operation, options: job.options });
    const [settings, order, link, photo] = await Promise.all([
      db.from('gallery_edit_settings').select('enabled').eq('id', true).single(),
      db.from('orders').select('total_cents,download_paid_at').eq('id',job.order_id).single(),
      db.from('delivery_links').select('expires_at').eq('id',job.delivery_link_id).eq('order_id',job.order_id).single(),
      db.from('photos').select('id').eq('id',job.photo_id).eq('order_id',job.order_id).eq('is_selected',true).in('kind',['processed','delivered']).single(),
    ]);
    if (!providerAvailable() || !settings.data?.enabled || settings.error || order.error || paywallFor(order.data).active || link.error || !link.data || (link.data.expires_at && new Date(link.data.expires_at)<=new Date()) || photo.error || !photo.data) throw new Error('access_changed');
    const source = await db.storage.from(job.source_bucket).download(job.source_path);
    if (source.error || !source.data || source.data.size > 40_000_000) throw new Error('source_unavailable');
    const normalized = await prepareSource(Buffer.from(await source.data.arrayBuffer()));
    const sourceCopy = await db.storage.from('gallery-edits').upload(`${job.order_id}/${id}/source.jpg`, await (await import('sharp')).default(normalized).jpeg({quality:94}).toBuffer(), { contentType:'image/jpeg',upsert:false });
    if (sourceCopy.error) throw new Error('storage_failed');
    const result = await openaiGptImage.process({ jobType: input.operation, inputs:[{bytes:normalized,filename:'property.png',mimeType:'image/png'}], prompt:clientEditPrompt(input) });
    if (!result.outputs[0]) throw new Error('missing_output');
    const bytes = await finishVariant(normalized, result.outputs[0].bytes, input);
    const path = `${job.order_id}/${id}/result.jpg`;
    const upload = await db.storage.from('gallery-edits').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
    if (upload.error) throw new Error('storage_failed');
    const saved = await db.from('gallery_edits').update({status:'review',output_path:path,model:result.model,usage:result.provenance?.usage ?? null,estimated_cost_cents:result.costCents,updated_at:new Date().toISOString()}).eq('id',id).eq('status','running').select('id').maybeSingle();
    if (saved.error || !saved.data) throw new Error('save_failed');
  } catch {
    // Never expose provider errors, prompts, storage paths or credentials to clients.
    await db.from('gallery_edits').update({error_code:'generation_failed'}).eq('id',id).eq('status','running');
    const refund = await db.rpc('settle_gallery_edit',{p_id:id,p_status:'failed'});
    if (refund.error) console.error('gallery_edit_settlement_pending',id);
  }
}

export async function recoverGalleryEdits() {
  const db = editDb();
  // A timeout may have been billed. Refund customer credits, keep spend allowance,
  // and never automatically replay an uncertain provider request.
  const stale = await db.from('gallery_edits').select('id').in('status',['queued','running']).lt('updated_at',new Date(Date.now()-15*60_000).toISOString()).limit(100);
  if (stale.error) throw new Error('recovery_unavailable');
  for (const row of stale.data ?? []) {
    const result = await db.rpc('settle_gallery_edit',{p_id:row.id,p_status:'failed'});
    if (result.error) console.error('gallery_edit_recovery_pending',row.id);
  }
  return stale.data?.length ?? 0;
}
