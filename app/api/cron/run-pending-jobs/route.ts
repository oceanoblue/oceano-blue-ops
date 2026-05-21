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
// On Vercel Hobby, function maxDuration is capped at 10s and crons run only
// once a day. So we don't use cron — we kick this endpoint when jobs are
// enqueued and it self-triggers (fetch+forget) until the queue is empty.
const BATCH = 2;       // small batch so we fit in Hobby's 10s window
const CONCURRENCY = 2;

export const dynamic = 'force-dynamic';
// Pro plan picks this up; Hobby clamps to 10s automatically.
export const maxDuration = 300;

async function handle(request: Request) {
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

  // Self-chain: if any jobs were processed this round AND more are pending,
  // fire-and-forget another invocation to keep the queue draining. This is
  // how we avoid needing a frequency-bounded cron job on Vercel Hobby.
  if (results.length > 0) {
    const { data: stillPending } = await admin
      .from('ai_jobs')
      .select('id')
      .in('status', ['pending', 'queued'])
      .limit(1);
    if (stillPending?.length) {
      const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
      const url = base?.startsWith('http') ? base : `https://${base}`;
      if (url) {
        // Fire and forget — don't await so this response returns promptly.
        fetch(`${url}/api/cron/run-pending-jobs`, {
          method: 'POST',
          headers: { authorization: `Bearer ${expected}` },
        }).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    processed: results.length,
    completed,
    failed,
    skipped,
  });
}

export const GET = handle;
export const POST = handle;
