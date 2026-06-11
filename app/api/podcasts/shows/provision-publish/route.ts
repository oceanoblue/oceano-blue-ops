import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { provisionPublishRoute } from '@/lib/integrations/make';

export const dynamic = 'force-dynamic';

/**
 * One-click "add this show to the publish Router" (Phase C). Append-only +
 * idempotent — only runs on operator click. On success, records the chosen
 * YouTube connection + provisioning timestamp on the show.
 */
const Body = z.object({
  show_id: z.string().uuid(),
  connection_id: z.number().int().positive(),
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

  const { data: show } = await admin
    .from('podcast_shows')
    .select('id, slug, name')
    .eq('id', parsed.data.show_id)
    .maybeSingle();
  if (!show) return NextResponse.json({ error: 'show_not_found' }, { status: 404 });

  const result = await provisionPublishRoute(show.slug, parsed.data.connection_id);

  if (result.status === 'created' || result.status === 'exists') {
    await admin
      .from('podcast_shows')
      .update({
        make_youtube_connection_id: String(parsed.data.connection_id),
        routes_provisioned_at: new Date().toISOString(),
      })
      .eq('id', show.id);
    await admin.from('production_events').insert({
      actor_type: 'user',
      actor_id: user.id,
      event_type: 'podcast_route_provisioned',
      summary: `Publish Router branch ${result.status} for ${show.name} (${show.slug})`,
      details: { connection_id: parsed.data.connection_id, result: result.status },
    });
  }

  const code = result.status === 'failed' ? 502 : result.status === 'not_configured' || result.status === 'no_router' ? 400 : 200;
  return NextResponse.json({ result }, { status: code });
}
