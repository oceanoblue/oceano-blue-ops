import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { createAdminClient } from '@/lib/supabase/server';
import { getProvider } from './index';
import { analyzePhoto, planEdits } from './vision-analyze';
import { buildAutoEnhanceJobRow } from './auto-enhance';
import { captureError } from '@/lib/observability/report';
import type { AiJob, Photo } from '@/lib/supabase/database.types';
import type { SourceImage } from './types';

// Delivery target long edge. By default we DO NOT upscale — enhance outputs are
// delivered at their real rendered resolution. Upscaling a smaller render up to a
// fixed "4K" only interpolates (manufactures) detail, which reads as soft/wrong;
// that downscale-then-upscale was a real quality regression. Set
// DELIVERY_LONG_EDGE to a positive value only if you explicitly want enlargement.
const DELIVERY_LONG_EDGE = (() => {
  const v = parseInt(process.env.DELIVERY_LONG_EDGE || '0', 10);
  return Number.isFinite(v) ? v : 0;
})();

// Long edge the inputs are fed to the pipeline / AI providers at. Feeding a small
// image makes the deterministic merge low-res AND gives a generative model too
// little detail to "see" the scene (it then invents appliances/walls/rooms).
// Default 6144 keeps near-native detail for typical full-frame bodies; override
// with AI_INPUT_LONG_EDGE (lower it if a generative provider rejects the payload).
const AI_INPUT_LONG_EDGE = (() => {
  const v = parseInt(process.env.AI_INPUT_LONG_EDGE || '6144', 10);
  return Number.isFinite(v) && v > 0 ? Math.max(v, DELIVERY_LONG_EDGE) : 6144;
})();

const GENERATED_PREFIX =
  /^(hdr_merge|enhance_single|sky_replace|window_pull|lawn_enhance|declutter|twilight_convert|virtual_stage)-\d+.*$/i;

/**
 * Derive a clean, human delivery name from a source filename. Strips the
 * extension, our own `-enhanced` suffix, and any generated job prefix
 * (`hdr_merge-1782…`, `enhance_single-…`, etc.) so outputs stay named after the
 * ORIGINAL frame (e.g. OBM03968) rather than the job type. Falls back to
 * "photo" if nothing usable remains.
 */
function cleanBaseName(filename: string): string {
  let n = (filename || '').replace(/\.[^.]+$/, '');
  n = n.replace(/-enhanced$/i, '');
  n = n.replace(GENERATED_PREFIX, '');
  n = n.trim();
  return n || 'photo';
}

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

    // The deterministic engine (oceano-enhance) can decode RAW via libraw;
    // generative providers (gpt-image) cannot. So only pull the RAW original for
    // the deterministic job types — generative jobs keep using the JPEG preview.
    const deterministic = job.job_type === 'hdr_merge' || job.job_type === 'enhance_single';

    const sources: SourceImage[] = await Promise.all(
      inputs.map(async (p: Photo) => {
        const rawPath = (p as any).raw_storage_path as string | null | undefined;
        const useRaw = deterministic && !!rawPath;
        const dlPath = useRaw ? (rawPath as string) : p.storage_path;
        const { data, error } = await supabase.storage.from(p.bucket).download(dlPath);
        if (error || !data) throw new Error(`Download failed: ${dlPath}`);
        const raw = Buffer.from(await data.arrayBuffer());
        // Camera RAW (.arw/.cr2/.nef/.dng/…): sharp can't decode it. Pass the
        // original bytes straight through so the deterministic edit engine
        // (libraw/rawpy in worker-edit) does a full RAW decode. This covers both
        // a RAW uploaded directly AND a RAW original stored beside a preview.
        const rawName = useRaw ? rawPath!.split('/').pop() || p.filename : p.filename;
        if (useRaw || /\.(arw|cr2|cr3|nef|nrw|dng|raf|orf|rw2|pef|srw|sr2)$/i.test(rawName || '')) {
          return {
            bytes: raw,
            filename: rawName,
            mimeType: 'image/x-raw',
            bracketIndex: (p.exif as any)?.ExposureBiasValue,
          };
        }
        // Preprocess: normalize orientation + cap the long edge. Keep this at
        // full delivery resolution so the deterministic merge stays sharp and a
        // generative enhance gets enough detail to stay faithful (a downscaled
        // input is what makes it hallucinate). Constrain by the LONG edge so
        // portrait frames aren't left oversized.
        const processed = await sharp(raw)
          .rotate()
          .resize({
            width: AI_INPUT_LONG_EDGE,
            height: AI_INPUT_LONG_EDGE,
            fit: 'inside',
            withoutEnlargement: true,
            kernel: 'lanczos3',
          })
          .jpeg({ quality: 92, mozjpeg: true })
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
      // Optional enlargement: only if DELIVERY_LONG_EDGE is set ABOVE the output's
      // real size (default 0 = never). We do not upscale by default — interpolating
      // a smaller render up to a fixed size manufactures detail and reads as soft.
      // HDR-merge passthroughs are intermediates (re-enhanced later), left as-is.
      let bytes = out.bytes;
      let mimeType = out.mimeType;
      // Name the output after the ORIGINAL frame, not the job type. The merged
      // base keeps the plain name (e.g. OBM03968.jpg); every enhanced output
      // gets a single "-enhanced" suffix (OBM03968-enhanced.jpg) — never
      // "enhance_single-1782…", "declutter-…", etc.
      const srcName =
        [...inputs].sort((a: Photo, b: Photo) => (a.filename || '').localeCompare(b.filename || ''))[0]
          ?.filename ?? out.filename;
      const baseName = cleanBaseName(srcName);
      let filename = job.job_type === 'hdr_merge' ? `${baseName}.jpg` : `${baseName}-enhanced.jpg`;
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
        // Reproducibility: link the output to its job and stash the full recipe
        // so this edit can be re-run, tweaked, or applied to other frames.
        source_job_id: jobId,
        ai_recipe: (job.params as any)?.recipe ?? null,
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
        captureError('ai.runner.autochain', chainErr, { jobId, orderId: job.order_id });
      }
    }

    // Auto-enhance on upload (merged HDR bases). When an hdr_merge finishes and
    // the org setting is on, kick the signature enhance on the merged base
    // automatically — no manual "Run AI" click. Fires here so the timing is
    // exact (the base now exists) and runs server-side via cron even if the
    // photographer has left the page. Idempotent: skip any base that already has
    // an enhance job. Singles take the /api/ai/auto-enhance path instead.
    if (job.job_type === 'hdr_merge' && outputPhotoIds.length > 0) {
      try {
        const { data: bs } = await supabase
          .from('business_settings')
          .select('auto_enhance_on_upload')
          .eq('id', true)
          .maybeSingle();
        if ((bs as any)?.auto_enhance_on_upload !== false) {
          const enhanceProvider = getProvider('auto', 'enhance_single');
          if (enhanceProvider.isConfigured()) {
            const rows: any[] = [];
            for (const baseId of outputPhotoIds) {
              const { data: existing } = await supabase
                .from('ai_jobs')
                .select('id')
                .eq('order_id', job.order_id)
                .eq('job_type', 'enhance_single')
                .contains('input_photo_ids', [baseId])
                .limit(1);
              if (existing && existing.length) continue;
              rows.push(
                buildAutoEnhanceJobRow({
                  orderId: job.order_id,
                  baseId,
                  providerId: enhanceProvider.id,
                  createdBy: job.created_by,
                })
              );
            }
            if (rows.length) await supabase.from('ai_jobs').insert(rows);
          }
        }
      } catch (autoErr) {
        // Auto-enhance is best-effort — never fail the merge over it.
        captureError('ai.runner.autoenhance', autoErr, { jobId, orderId: job.order_id });
      }
    }

    return { jobId, status: 'complete', outputPhotoIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    captureError('ai.runner', err, {
      jobId,
      jobType: job.job_type,
      orderId: job.order_id,
      provider: job.provider,
    });
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
