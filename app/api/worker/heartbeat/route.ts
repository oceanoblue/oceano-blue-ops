import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateWorker } from '@/lib/worker/auth';

export const dynamic = 'force-dynamic';

/** Worker heartbeat — marks the worker online and refreshes capabilities/metadata. */
const Body = z.object({
  capabilities: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  const admin = createAdminClient() as any;
  const worker = await authenticateWorker(request, admin);
  if (!worker) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  const patch: Record<string, unknown> = {
    status: 'online',
    last_heartbeat_at: new Date().toISOString(),
  };
  if (parsed.success && parsed.data.capabilities) patch.capabilities = parsed.data.capabilities;
  if (parsed.success && parsed.data.metadata) patch.metadata = parsed.data.metadata;

  await admin.from('local_workers').update(patch).eq('id', worker.id);
  return NextResponse.json({ ok: true, worker_id: worker.id });
}
