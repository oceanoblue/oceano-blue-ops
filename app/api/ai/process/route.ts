import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { detectBrackets } from '@/lib/ai/bracket-detect';
import { runAiJob } from '@/lib/ai/runner';
import { getProvider } from '@/lib/ai';
import { buildPrompt } from '@/lib/ai/prompts';
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
  provider: z.enum(['openai-gpt-image', 'gemini-banana-pro', 'auto']).default('auto'),
  photo_ids: z.array(z.string().uuid()).optional(), // explicit selection
  prompt_extra: z.string().optional(),
  run_inline: z.boolean().default(true),            // run synchronously by default
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { order_id, job_type, provider, photo_ids, prompt_extra, run_inline } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  // Resolve which photos to operate on. Skip RAW formats — they need JPEG
  // conversion before being sent to OpenAI / Gemini.
  const RAW_EXT = /\.(arw|cr2|cr3|nef|dng|raf|rw2|orf)$/i;
  const { data: photos } = await admin
    .from('photos')
    .select('*')
    .eq('order_id', order_id)
    .eq('kind', 'raw');
  if (!photos?.length) {
    return NextResponse.json({ error: 'no_raw_photos' }, { status: 400 });
  }
  const eligible = (photos as any[]).filter((p) => !RAW_EXT.test(p.filename));
  const rawSkipped = (photos as any[]).length - eligible.length;
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
  if (job_type === 'hdr_merge') {
    if (photo_ids && photo_ids.length >= 3) {
      jobInputs = [photo_ids.filter((id) => eligibleIds.has(id))];
    } else {
      const groups = detectBrackets(eligible as Photo[]);
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
      : eligible.map((p: any) => p.id);
    jobInputs = target.map((id) => [id]);
  }

  // Create one ai_jobs row per input group
  const resolvedProvider = getProvider(provider, job_type as AiJobType).id;
  const promptText = buildPrompt(job_type as AiJobType, prompt_extra);

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
      }))
    )
    .select('id');
  if (jobErr || !jobs) {
    return NextResponse.json({ error: jobErr?.message || 'job_insert_failed' }, { status: 500 });
  }

  // Bump order status
  await admin.from('orders').update({ status: 'processing' }).eq('id', order_id);

  if (!run_inline) {
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
