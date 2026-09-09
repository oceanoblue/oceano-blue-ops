import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { editEngineConfigured, extractFrames } from '@/lib/ai/edit-engine';
import { getTemporaryLink, isDropboxConfigured, showFolderPath, uploadFile } from '@/lib/integrations/dropbox';
import { buildContactSheet } from '@/lib/podcasts/contact-sheet';
import { resolveEpisodeSource } from '@/lib/podcasts/episode-source';
import {
  buildPickOutput,
  fetchImage,
  pickFramesWithVision,
  youtubeFrameCandidates,
} from '@/lib/podcasts/frame-picker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Cold Fly machine + 12 ffmpeg seeks + vision + 3 Dropbox writes ≈ 40–60 s; cap at 5 min.
export const maxDuration = 300;

/**
 * Make → POS: pick the hosts + guest source frames for an episode thumbnail.
 *
 * v2: frames are sampled from the episode's own mp4 in Dropbox (worker-edit
 * /frames, ffmpeg) — 12 across the runtime — and the picks plus a numbered
 * contact sheet are written to <show>/Thumbnails/frames/<basename>/ so the
 * owner can see what was considered. If the video can't be reached for any
 * reason, v1 behaviour applies: YouTube's three auto-frames.
 *
 * Server-to-server, authenticated with the shared `x-pos-automation-secret`
 * header exactly like the Make callback. Body: { show_slug, youtube_id }.
 * Returns frame URLs for Make to download; nulls mean "use your fallback"
 * (refs/hosts.jpg for hosts, the mid-video YouTube frame for the guest).
 * Never a 5xx for a picker miss — a miss is a valid answer.
 */
const Body = z.object({
  show_slug: z.string().min(1).max(100),
  youtube_id: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
});

const VIDEO_FRAME_COUNT = 12;

type Candidate = { index: number; bytes: Buffer; url: string | null };

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

/** v2 source: frames from the episode mp4. null = fall back to YouTube. */
async function loadVideoFrames(youtubeId: string, admin: any): Promise<{ frames: Candidate[]; basename: string } | null> {
  if (!isDropboxConfigured() || !editEngineConfigured()) return null;
  const source = await resolveEpisodeSource(admin, youtubeId);
  if (!source) {
    console.warn('[pick-frames] no Dropbox source for', youtubeId, '— using YouTube frames');
    return null;
  }
  try {
    const link = await getTemporaryLink(source.dropboxPath);
    const { frames } = await extractFrames(link, { count: VIDEO_FRAME_COUNT });
    if (frames.length === 0) return null;
    // Re-number 1..N in order so FRAME labels are contiguous even if the worker dropped some.
    return { basename: source.basename, frames: frames.map((f, i) => ({ index: i + 1, bytes: f.bytes, url: null })) };
  } catch (err) {
    console.warn('[pick-frames] video frames unavailable:', (err as Error)?.message ?? err);
    return null;
  }
}

/** v1 source: YouTube's auto-extracted frames (untouched by custom thumbnails). */
async function loadYoutubeFrames(youtubeId: string): Promise<Candidate[]> {
  const found = await Promise.all(
    [1, 2, 3].map(async (index) => {
      for (const url of youtubeFrameCandidates(youtubeId, index)) {
        const bytes = await fetchImage(url);
        if (bytes) return { index, bytes, url } as Candidate;
      }
      return null;
    })
  );
  return found.filter((f): f is Candidate => f !== null);
}

/** Write a picked frame to Dropbox and hand back a link Make can download; null + reason on failure. */
async function publishPick(
  folder: string,
  name: 'hosts' | 'guest',
  frame: Candidate | undefined
): Promise<{ url: string | null; reason: string | null }> {
  if (!frame) return { url: null, reason: null };
  const path = `${folder}/${name}.jpg`;
  const up = await uploadFile(path, frame.bytes);
  if (up.status !== 'ok') return { url: null, reason: `upload failed: ${up.status === 'failed' ? up.error : up.status}` };
  try {
    return { url: await getTemporaryLink(path), reason: null };
  } catch (err) {
    return { url: null, reason: `link failed: ${(err as Error)?.message ?? err}` };
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
  const admin = createAdminClient() as any;

  // Inputs in parallel: the hosts reference + the episode's own frames (or YouTube's).
  const [reference, video] = await Promise.all([loadHostsReference(show_slug), loadVideoFrames(youtube_id, admin)]);
  const frameSource: 'video' | 'youtube' = video ? 'video' : 'youtube';
  const frames: Candidate[] = video ? video.frames : await loadYoutubeFrames(youtube_id);
  const framesFolder = video ? `${showFolderPath(show_slug)}/Thumbnails/frames/${video.basename}` : null;

  if (frames.length === 0) {
    return NextResponse.json(
      buildPickOutput({ picked: null, frameSource, framesConsidered: 0, hostsReferenceUsed: reference !== null, hostsUrl: null, guestUrl: null, framesFolder })
    );
  }

  const picked = await pickFramesWithVision(
    reference,
    frames.map(({ index, bytes }) => ({ index, bytes }))
  );

  let hostsUrl: string | null = null;
  let guestUrl: string | null = null;
  let noteSuffix = '';

  if (video && framesFolder) {
    // Always leave the contact sheet, even on a picker miss — it explains the miss.
    try {
      const sheet = await buildContactSheet(frames.map(({ index, bytes }) => ({ index, bytes })));
      const up = await uploadFile(`${framesFolder}/candidates.jpg`, sheet);
      if (up.status === 'failed') console.warn('[pick-frames] contact sheet upload failed:', up.error);
    } catch (err) {
      console.warn('[pick-frames] contact sheet failed:', (err as Error)?.message ?? err);
    }
    if (picked) {
      // Sequential on purpose: Dropbox rejects concurrent writes in one folder (too_many_write_operations).
      const h = await publishPick(framesFolder, 'hosts', frames.find((f) => f.index === picked.result.hosts_frame));
      const g = await publishPick(framesFolder, 'guest', frames.find((f) => f.index === picked.result.guest_frame));
      hostsUrl = h.url;
      guestUrl = g.url;
      for (const reason of [h.reason, g.reason]) if (reason) noteSuffix += ` (${reason})`;
    }
  } else if (picked) {
    hostsUrl = frames.find((f) => f.index === picked.result.hosts_frame)?.url ?? null;
    guestUrl = frames.find((f) => f.index === picked.result.guest_frame)?.url ?? null;
  }

  return NextResponse.json(
    buildPickOutput({
      picked,
      frameSource,
      framesConsidered: frames.length,
      hostsReferenceUsed: reference !== null,
      hostsUrl,
      guestUrl,
      framesFolder,
      noteSuffix,
    })
  );
}
