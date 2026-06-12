import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { detectBrackets } from '@/lib/ai/bracket-detect';
import { runAiJob } from '@/lib/ai/runner';
import { getProvider } from '@/lib/ai';
import { buildPrompt, type EnhanceDirectives } from '@/lib/ai/prompts';
import type { AiJobType, Photo } from '@/lib/supabase/database.types';

const Body = z.object({
  order_id: z.string().uuid(),
  job_type: z.enum([
    'hdr_merge',
    'enhance_single',
    'sky_replace',
    'window_pull',
    'lawn_enhance',
    'declutter',
    'twilight_convert',
    'virtual_stage',
  ]),
  provider: z
    .enum([
      'oceano-enhance',
      'autoenhance',
      'openai-gpt-image',
      'gemini-nano-banana-2',
      'gemini-nano-banana-pro',
      'gemini-banana-pro', // legacy alias → Nano Banana Pro
      'auto',
    ])
    .default('auto'),
  photo_ids: z.array(z.string().uuid()).optional(), // explicit selection
  prompt_extra: z.string().optional(),
  // Listing enhance preferences that shape the enhance prompt.
  sky_style: z.enum(['original', 'sunny_puffs', 'loaded_puffs', 'crisp_streaks', 'clear_fade']).optional(),
  enhancement_style: z.enum(['signature', 'natural']).optional(),
  window_pull: z.boolean().optional(),
  perspective_correction: z.boolean().optional(),
  remove_reflections: z.boolean().optional(),
  blur_faces: z.boolean().optional(),
  // When true, after the main job completes the runner inspects the output
  // and enqueues follow-up sky_replace / window_pull / lawn / declutter
  // jobs if vision analysis flags them. Used by Stage 2's "Run AI" button.
  auto_chain_fixes: z.boolean().optional(),
  // Default false: enqueue jobs and let the background cron run them. The
  // synchronous path is kept for small batches and dev tests, but for any
  // real session you want this off so 75-120 photos don't timeout the
  // single Vercel function invocation.
  run_inline: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const {
    order_id,
    job_type,
    provider,
    photo_ids,
    prompt_extra,
    run_inline,
    auto_chain_fixes,
    sky_style,
    enhancement_style,
    window_pull,
    perspective_correction,
    remove_reflections,
    blur_faces,
  } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Fail fast with a clear message if the chosen engine has no API key, rather
  // than enqueuing jobs that error mid-run. Deterministic providers are always
  // configured.
  const resolved = getProvider(provider, job_type as AiJobType);
  if (!resolved.isConfigured()) {
    return NextResponse.json(
      {
        error: 'not_configured',
        provider: resolved.id,
        hint:
          resolved.id === 'openai-gpt-image'
            ? 'Set OPENAI_API_KEY in the environment to use GPT Image 2.0.'
            : resolved.id.startsWith('gemini')
              ? 'Set GEMINI_API_KEY in the environment to use Nano Banana.'
              : `Provider ${resolved.id} is missing its API key.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Resolve which photos to operate on. Eligible = any non-RAW image for the
  // order: RAW-converted JPEGs (kind 'raw'), merged HDR results and prior AI
  // outputs (kind 'processed'/'delivered'). RAW originals (.arw/.cr2/…) are
  // skipped — they must be converted to JPEG first.
  const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;
  const { data: photos } = await admin
    .from('photos')
    .select('*')
    .eq('order_id', order_id)
    .in('kind', ['raw', 'processed', 'delivered']);
  if (!photos?.length) {
    return NextResponse.json({ error: 'no_photos' }, { status: 400 });
  }
  const eligible = (photos as any[]).filter((p) => !RAW_EXT.test(p.filename));
  if (!eligible.length) {
    return NextResponse.json(
      {
        error: 'all_uploads_are_raw',
        hint: 'Convert ARW/CR2/CR3/NEF/DNG to JPEG before running AI jobs. The AI models accept JPEG/PNG only.',
      },
      { status: 400 }
    );
  }

  let jobInputs: string[][];
  const eligibleIds = new Set(eligible.map((p: any) => p.id));
  // Only the RAW-converted JPEGs feed the "enhance everything" / bracket
  // fallbacks — never the already-processed outputs.
  const rawJpegs = eligible.filter((p: any) => p.kind === 'raw');
  if (job_type === 'hdr_merge') {
    if (photo_ids && photo_ids.length >= 3) {
      jobInputs = [photo_ids.filter((id) => eligibleIds.has(id))];
    } else {
      const groups = detectBrackets(rawJpegs as Photo[]);
      jobInputs = Array.from(groups.values());
      if (jobInputs.length === 0) {
        return NextResponse.json(
          { error: 'no_brackets_detected', hint: 'Pass photo_ids explicitly or upload bracketed JPEGs.' },
          { status: 400 }
        );
      }
    }
  } else {
    const target = photo_ids?.length
      ? photo_ids.filter((id) => eligibleIds.has(id))
      : rawJpegs.map((p: any) => p.id);
    jobInputs = target.map((id) => [id]);
  }

  if (jobInputs.length === 0) {
    return NextResponse.json(
      { error: 'no_eligible_photos', hint: 'Selected photos are not enhanceable (RAW or not found).' },
      { status: 400 }
    );
  }

  // Create one ai_jobs row per input group
  const resolvedProvider = resolved.id;
  const hasDirectives =
    sky_style !== undefined ||
    enhancement_style !== undefined ||
    window_pull !== undefined ||
    perspective_correction !== undefined ||
    remove_reflections !== undefined ||
    blur_faces !== undefined;
  const directives: EnhanceDirectives | string | undefined = hasDirectives
    ? {
        extra: prompt_extra,
        skyStyle: sky_style,
        enhancementStyle: enhancement_style,
        windowPull: window_pull,
        perspectiveCorrection: perspective_correction,
        removeReflections: remove_reflections,
        blurFaces: blur_faces,
      }
    : prompt_extra;
  const promptText = buildPrompt(job_type as AiJobType, directives);

  const { data: jobs, error: jobErr } = await admin
    .from('ai_jobs')
    .insert(
      jobInputs.map((input_photo_ids) => ({
        order_id,
        job_type,
        provider: resolvedProvider,
        input_photo_ids,
        prompt: promptText,
        status: 'pending' as const,
        created_by: user.id,
        params: auto_chain_fixes ? { auto_chain_fixes: true } : null,
      }))
    )
    .select('id');
  if (jobErr || !jobs) {
    return NextResponse.json({ error: jobErr?.message || 'job_insert_failed' }, { status: 500 });
  }

  // Bump order status
  await admin.from('orders').update({ status: 'processing' }).eq('id', order_id);

  if (!run_inline) {
    // Vercel Hobby has no per-minute cron, so we kick off the worker
    // endpoint right after enqueueing. It self-chains until the queue is
    // empty. Fire-and-forget so this response returns instantly.
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    const secret = process.env.CRON_SECRET;
    if (base && secret) {
      const url = base.startsWith('http') ? base : `https://${base}`;
      fetch(`${url}/api/cron/run-pending-jobs`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      }).catch(() => {}); // non-blocking
    }
    return NextResponse.json({ queued: jobs.map((j) => j.id) });
  }

  // Run sequentially. For larger batches, swap to a real queue (Inngest,
  // Trigger.dev, Supabase Edge Functions + pg_cron).
  const results: Awaited<ReturnType<typeof runAiJob>>[] = [];
  for (const j of jobs) {
    results.push(await runAiJob(j.id));
  }

  return NextResponse.json({ jobs: results });
}
