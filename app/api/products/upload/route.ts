import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Upload one or more images for product display.
 * Stored in the public-assets bucket. Returns public URLs.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'no files' }, { status: 400 });

  const admin = createAdminClient();
  const urls: string[] = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const key = `products/${uuidv4()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from('public-assets')
      .upload(key, buf, { contentType: file.type, upsert: false });
    if (upErr) {
      return NextResponse.json({ error: upErr.message, file: file.name }, { status: 500 });
    }
    const { data } = admin.storage.from('public-assets').getPublicUrl(key);
    urls.push(data.publicUrl);
  }

  return NextResponse.json({ urls });
}
