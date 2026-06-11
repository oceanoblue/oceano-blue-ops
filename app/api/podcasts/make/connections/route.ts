import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listYoutubeConnections, isMakeConfigured } from '@/lib/integrations/make';

export const dynamic = 'force-dynamic';

/** List Make YouTube connections for the publishing-setup picker (internal). */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!isMakeConfigured()) return NextResponse.json({ configured: false, connections: [] });
  try {
    const connections = await listYoutubeConnections();
    return NextResponse.json({ configured: true, connections: connections ?? [] });
  } catch {
    return NextResponse.json({ configured: true, connections: [], error: 'make_list_failed' }, { status: 502 });
  }
}
