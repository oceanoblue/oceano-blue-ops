import { NextResponse } from 'next/server';
import { runYoutubeUpload } from '@/lib/podcasts/youtube-upload';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({error:'unauthorized'}, {status:401});
  try { return NextResponse.json(await runYoutubeUpload()); }
  catch { return NextResponse.json({error:'upload_queue_unavailable'}, {status:500}); }
}
