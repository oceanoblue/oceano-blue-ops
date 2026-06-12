import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/server';
import { getProvider } from './index';
import { analyzePhoto, planEdits } from './vision-analyze';
import type { AiJob, Photo } from '@/lib/supabase/database.types';
import type { SourceImage } from './types';

// Delivery target long edge. Enhance outputs are upscaled to this size with a
// high-quality kernel so finals are ~4K without re-rendering any detail.
// Override with DELIVERY_LONG_EDGE (e.g. 3072 for 6MP, 0 to disable upscaling).
const DELIVERY_LONG_EDGE = (() => {
  const v = parseInt(process.env.DELIVERY_LONG_EDGE || '3840', 10);
  return Number.isFinite(v) ? v : 3840;
})();

/**
 * Runs a single ai_jobs row end-to-end:
 *   1. Mark job + input photos as running
 *   2. Download inputs from Supabase Storage
 *   3. Call the provider
 *   4. Upload outputs to processed-photos bucket, insert photo rows
 *   5. Mark job complete with timing + cost
 *
 * Designed to be invoked from /api/ai/process (HTTP) or a scheduled task /
 * webhook. Idempotent: if the job is not in `pending` it returns early.
 */
export async function runAiJob(jobId: string): Promise<{
  jobId: string;
  status: 'complete' | 'failed' | 'skipped';
  outputPhotoIds?: string[];
  error?: string;
}> {
  const supabase = createAdminClient();
  const startedAt = Date.now();

  // 1. Atomically claim the job. The conditional .eq('status', 'pending')
  // turns the UPDATE into a single Postgres statement that only succeeds when
  // the row is still pending — so if a second cron invocation tries to grab
  // the same job a fraction of a second later, it gets nothing back and we
  // return early. No double-processing, no doubled API spend.
  const { data: claimed } = await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['pending', 'queued'])
    .select('*')
    .maybeSingle();
  if (!claimed) {
    return { jobId, status: 'skipped' };
  }
  const job = claimed as any;
  await supabase
    .from('photos')
    .update({ processing_status: 'running' })
    .in('id', job.input_photo_ids);

  try {
    // 2. Load input photos and download bytes
    const { data: inputs } = await supabase
      .from('photos')
      .select('*')
      .in('id', job.input_photo_ids);
    if (!inputs?.length) throw new Error('No input photos found');

    const sources: SourceImage[] = await Promise.all(
      inputs.map(async (p: Photo) => {
        const { data, error } = await supabase.storage
          .from(p.bucket)
          .download(p.storage_path);
        if (error || !data) throw new Error(`Download failed: ${p.storage_path}`);
        const raw = Buffer.from(await data.arrayBuffer());
        // Preprocess: ensure JPEG ≤ ~4MB for AI providers
        const processed = await sharp(raw)
          .rotate()
          .resize({ width: 2048, withoutEnlargement: true })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer();
        return {
          bytes: processed,
          filename: p.filename,
          mimeType: 'image/jpeg',
          bracketIndex: (p.exif as any)?.ExposureBiasValue,
        };
      })
    );

    // 3. Run provider
    const provider = getProvider((job.provider as any) ?? 'auto', job.job_type);
    const resp = await provider.process({
      jobType: job.job_type,
      inputs: sources,
      prompt: job.prompt ?? undefined,
      params: (job.params as any) ?? undefined,
    });

    // 4. Upload outputs and create photo rows
    const outputPhotoIds: string[] = [];
    for (const out of resp.outputs) {
      // Faithful 4K: deterministically upscale enhance outputs to the delivery
      // long edge (default 3840) with a high-quality kernel. This is pure
      // interpolation — it NEVER re-renders content, so house numbers, signage,
      // and fine text stay exactly as the model preserved them. HDR-merge
      // passthroughs are intermediates (re-enhanced later), so they're left as-is.
      let bytes = out.bytes;
      let mimeType = out.mimeType;
      let filename = out.filename;
      if (job.job_type !== 'hdr_merge') {
        try {
          const src = await sharp(out.bytes).metadata();
          const longEdge = Math.max(src.width ?? 0, src.height ?? 0);
          if (longEdge > 0 && longEdge < DELIVERY_LONG_EDGE) {
            const scale = DELIVERY_LONG_EDGE / longEdge;
            bytes = await sharp(out.bytes)
              .resize({
                width: Math.round((src.width ?? 0) * scale),
                height: Math.round((src.height ?? 0) * scale),
                kernel: 'lanczos3',
              })
              .jpeg({ quality: 90, mozjpeg: true })
              .toBuffer();
            mimeType = 'image/jpeg';
            filename = out.filename.replace(/\.[^.]+$/, '') + '.jpg';
          }
        } catch {
          bytes = out.bytes; // any sharp hiccup → ship the model output as-is
        }
      }

      const photoId = uuidv4();
      const storagePath = `${job.order_id}/${photoId}-${filename}`;
      const { error: upErr } = await supabase.storage
        .from('processed-photos')
        .upload(storagePath, bytes, {
          contentType: mimeType,
          upsert: false,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const meta = await sharp(bytes).metadata();
      const { error: insErr } = await supabase.from('photos').insert({
        id: photoId,
        order_id: job.order_id,
        kind: 'processed',
        parent_photo_id: inputs[0]?.id,
        storage_path: storagePath,
        bucket: 'processed-photos',
        filename,
        mime_type: mimeType,
        width: meta.width,
        height: meta.height,
        byte_size: bytes.byteLength,
        is_hdr: job.job_type === 'hdr_merge',
        processing_status: 'complete',
        // Record the concrete provider that ran. ai_jobs.provider is already
        // resolved to a concrete id at enqueue time (never 'auto').
        ai_provider: job.provider ?? 'oceano-enhance',
        ai_prompt: resp.rawPromptUsed,
        ai_cost_cents: resp.costCents,
      });
      if (insErr) throw new Error(`Photo insert failed: ${insErr.message}`);
      outputPhotoIds.push(photoId);
    }

    // 5. Mark job + inputs complete
    const durationMs = Date.now() - startedAt;
    await supabase
      .from('ai_jobs')
      .update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        cost_cents: resp.costCents,
        model: resp.model,
        output_photo_ids: outputPhotoIds,
      })
      .eq('id', jobId);
    await supabase
      .from('photos')
      .update({ processing_status: 'complete' })
      .in('id', job.input_photo_ids);

    await supabase.from('activity_log').insert({
      order_id: job.order_id,
      actor_type: 'system',
      action: 'ai_job_completed',
      details: {
        job_type: job.job_type,
        provider: resp.model,
        duration_ms: durationMs,
        cost_cents: resp.costCents,
        notes: resp.notes ?? null,
      },
    });

    // Auto-chain follow-up fixes if requested. Used by Stage 2 of the
    // photographer UI: after the master prompt runs, look at the output and
    // decide if sky / window / lawn / declutter would meaningfully improve
    // it. Each follow-up is a fresh ai_jobs row that gets picked up by the
    // cron processor — keeps each invocation fast and recoverable.
    const wantsAutoChain = (job.params as any)?.auto_chain_fixes === true;
    const isEnhanceJob = job.job_type === 'enhance_single' || job.job_type === 'hdr_merge';
    if (wantsAutoChain && isEnhanceJob && outputPhotoIds.length > 0) {
      try {
        const finalOutput = resp.outputs[0];
        if (finalOutput) {
          const analysis = await analyzePhoto(finalOutput.bytes);
          if (analysis) {
            const planned = planEdits(analysis);
            if (planned.length > 0) {
              const outputId = outputPhotoIds[0];
              await supabase.from('ai_jobs').insert(
                planned.map((edit) => ({
                  order_id: job.order_id,
                  job_type: edit,
                  provider: 'auto',
                  input_photo_ids: [outputId],
                  prompt: null,
                  status: 'pending' as const,
                  created_by: job.created_by,
                  params: { auto_chained_from: jobId, analysis_notes: analysis.notes },
                }))
              );
            }
          }
        }
      } catch (chainErr) {
        // Don't fail the parent job over an auto-chain hiccup.
        console.error('[runner] auto-chain failed:', chainErr);
      }
    }

    return { jobId, status: 'complete', outputPhotoIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message,
        duration_ms: Date.now() - startedAt,
      })
      .eq('id', jobId);
    await supabase
      .from('photos')
      .update({ processing_status: 'failed' })
      .in('id', job.input_photo_ids);

    return { jobId, status: 'failed', error: message };
  }
}
