import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listTransistorShows, isTransistorConfigured } from '@/lib/integrations/transistor';

export const dynamic = 'force-dynamic';

/** List Transistor shows for the show-settings picker (internal). */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!isTransistorConfigured()) return NextResponse.json({ configured: false, shows: [] });
  try {
    const shows = await listTransistorShows();
    return NextResponse.json({ configured: true, shows: shows ?? [] });
  } catch {
    return NextResponse.json({ configured: true, shows: [], error: 'transistor_list_failed' }, { status: 502 });
  }
}
