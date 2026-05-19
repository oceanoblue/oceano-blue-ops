import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runAiJob } from '@/lib/ai/runner';

/**
 * Background AI job processor.
 *
 * Runs every minute via vercel.json cron. Each invocation:
 *   1. Pulls up to BATCH pending jobs (oldest first)
 *   2. Runs them with bounded parallelism (CONCURRENCY)
 *   3. Returns a summary
 *
 * The runner uses a conditional UPDATE to atomically claim each job, so two
 * overlapping cron invocations never process the same job twice.
 *
 * Tuning notes:
 *   - BATCH is sized so a typical 30-60s job * (BATCH / CONCURRENCY) fits
 *     within maxDuration (default 300s on Vercel Pro).
 *   - To process faster, increase CONCURRENCY (uses more memory + parallel
 *     API rate limit) or call this route from a separate trigger more often.
 */
const BATCH = 8;
const CONCURRENCY = 3;

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!expected || provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: pending } = await admin
    .from('ai_jobs')
    .select('id')
    .in('status', ['pending', 'queued'])
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (!pending?.length) {
    return NextResponse.json({ processed: 0, message: 'no_pending_jobs' });
  }

  // Bounded-parallel worker pool. Promise.all on a fixed number of workers
  // that each pull from a shared queue — keeps memory and API rate usage
  // predictable when batch sizes vary.
  const queue = pending.slice();
  const results: any[] = [];

  async function worker() {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      try {
        const r = await runAiJob(next.id);
        results.push(r);
      } catch (err: any) {
        results.push({
          jobId: next.id,
          status: 'failed',
          error: err?.message || String(err),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker)
  );

  const completed = results.filter((r) => r.status === 'complete').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  return NextResponse.json({
    processed: results.length,
    completed,
    failed,
    skipped,
  });
}
