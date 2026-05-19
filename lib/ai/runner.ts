import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/server';
import { getProvider } from './index';
import type { AiJob, Photo } from '@/lib/supabase/database.types';
import type { SourceImage } from './types';

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

  // 1. Claim the job
  const { data: job, error: jobErr } = await supabase
    .from('ai_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (jobErr || !job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'pending' && job.status !== 'queued') {
    return { jobId, status: 'skipped' };
  }

  await supabase
    .from('ai_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);
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
      const photoId = uuidv4();
      const storagePath = `${job.order_id}/${photoId}-${out.filename}`;
      const { error: upErr } = await supabase.storage
        .from('processed-photos')
        .upload(storagePath, out.bytes, {
          contentType: out.mimeType,
          upsert: false,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const meta = await sharp(out.bytes).metadata();
      const { error: insErr } = await supabase.from('photos').insert({
        id: photoId,
        order_id: job.order_id,
        kind: 'processed',
        parent_photo_id: inputs[0]?.id,
        storage_path: storagePath,
        bucket: 'processed-photos',
        filename: out.filename,
        mime_type: out.mimeType,
        width: meta.width,
        height: meta.height,
        byte_size: out.bytes.byteLength,
        is_hdr: job.job_type === 'hdr_merge',
        processing_status: 'complete',
        ai_provider: resp.model.startsWith('oceano-enhance')
          ? 'oceano-enhance'
          : resp.model.startsWith('autoenhance')
            ? 'autoenhance'
            : resp.model.startsWith('gpt')
              ? 'openai-gpt-image'
              : 'gemini-banana-pro',
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
