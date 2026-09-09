import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getTemporaryLink, isDropboxConfigured, showFolderPath } from '@/lib/integrations/dropbox';
import {
  fetchImage,
  pickFramesWithVision,
  youtubeFrameCandidates,
  type FrameCandidate,
  type PickFramesOutput,
} from '@/lib/podcasts/frame-picker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Make → POS: pick the hosts + guest source frames for an episode thumbnail.
 *
 * Server-to-server, authenticated with the shared `x-pos-automation-secret`
 * header exactly like the Make callback (this path is public at the proxy
 * layer). Body: { show_slug, youtube_id }.
 *
 * Returns the chosen frame URLs (YouTube auto-frames) so the Make scenario can
 * download them; nulls mean "use your fallback" (the standing hosts.jpg for
 * hosts, the mid-video frame for the guest). Never throws a 5xx for a picker
 * miss — a miss is a valid answer.
 */
const Body = z.object({
  show_slug: z.string().min(1).max(100),
  youtube_id: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
});

function authorized(request: Request): boolean {
  const secret = process.env.POS_AUTOMATION_SECRET;
  if (!secret) return false;
  const presented = request.headers.get('x-pos-automation-secret') ?? '';
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/** Standing identity reference: <show folder>/Thumbnails/refs/hosts.jpg */
async function loadHostsReference(showSlug: string): Promise<Buffer | null> {
  if (!isDropboxConfigured()) return null;
  try {
    const link = await getTemporaryLink(`${showFolderPath(showSlug)}/Thumbnails/refs/hosts.jpg`);
    return await fetchImage(link, 15_000);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!process.env.POS_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { show_slug, youtube_id } = parsed.data;

  // Gather inputs in parallel: the hosts reference + up to 3 YouTube frames.
  const [reference, ...frameBytes] = await Promise.all([
    loadHostsReference(show_slug),
    ...[1, 2, 3].map(async (index) => {
      for (const url of youtubeFrameCandidates(youtube_id, index)) {
        const bytes = await fetchImage(url);
        if (bytes) return { index, url, bytes };
      }
      return null;
    }),
  ]);
  const frames = frameBytes.filter((f): f is { index: number; url: string; bytes: Buffer } => f !== null);
  const candidates: FrameCandidate[] = frames.map(({ index, url }) => ({ index, url }));

  const empty: PickFramesOutput = {
    hosts_frame: null,
    guest_frame: null,
    guest_remote: false,
    notes: frames.length === 0 ? 'No video frames available yet.' : 'Picker unavailable.',
    hosts_frame_url: null,
    guest_frame_url: null,
    hosts_reference_used: reference !== null,
    frames_considered: frames.length,
    model: null,
  };
  if (frames.length === 0) return NextResponse.json(empty);

  const picked = await pickFramesWithVision(
    reference,
    frames.map(({ index, bytes }) => ({ index, bytes }))
  );
  if (!picked) return NextResponse.json(empty);

  const urlFor = (i: number | null) => candidates.find((c) => c.index === i)?.url ?? null;
  const out: PickFramesOutput = {
    ...picked.result,
    hosts_frame_url: urlFor(picked.result.hosts_frame),
    guest_frame_url: urlFor(picked.result.guest_frame),
    hosts_reference_used: reference !== null,
    frames_considered: frames.length,
    model: picked.model,
  };
  return NextResponse.json(out);
}
