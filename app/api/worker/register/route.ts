import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { generateWorkerKey, WORKER_CAPS as CAPS } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/**
 * Register a local worker (owner/internal action). Generates a per-worker API
 * key, stores only its SHA-256 hash, and returns the plaintext key ONCE.
 */

const Body = z.object({
  name: z.string().min(1).max(120),
  hostname: z.string().max(200).optional(),
  capabilities: z.array(z.enum(CAPS)).optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const admin = createAdminClient() as any;
  const { key, hash, prefix } = generateWorkerKey();

  const { data: worker, error } = await admin
    .from('local_workers')
    .insert({
      name: parsed.data.name,
      hostname: parsed.data.hostname ?? null,
      capabilities: parsed.data.capabilities ?? [...CAPS],
      status: 'offline',
      api_key_hash: hash,
      api_key_prefix: prefix,
      metadata: { registered_by: user.id },
    })
    .select('id, name, capabilities')
    .single();
  if (error || !worker) return NextResponse.json({ error: error?.message ?? 'register_failed' }, { status: 500 });

  await admin.from('production_events').insert({
    actor_type: 'user',
    actor_id: user.id,
    event_type: 'worker_registered',
    summary: `Registered local worker: ${parsed.data.name}`,
    details: { worker_id: worker.id },
  });

  // api_key is returned ONCE here; it is never stored in plaintext or logged.
  return NextResponse.json({ ok: true, worker_id: worker.id, api_key: key, capabilities: worker.capabilities });
}
