import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { matchReturnedFile, type ManifestEntry } from '@/lib/external-edit/manifest';

/**
 * Registers edited files returned from Fotello. The browser uploads the files
 * directly to the processed-photos bucket (same pattern as photo register —
 * Vercel's request-body limit rules out proxying bytes through here), then
 * posts the storage paths. Each file is matched to a manifest entry by
 * filename stem; a `mapping` from the manual-match tray overrides auto-match.
 * Matched files become new `processed` photo rows parented to the original.
 * Unmatched files are reported back for the tray — never guessed, never
 * silently dropped.
 */
const Body = z.object({
  files: z.array(
    z.object({
      name: z.string().min(1),
      storage_path: z.string().min(1),
      byte_size: z.number().int().nonnegative(),
      mime_type: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
  ),
  /** filename → photo_id (a manifest photo_id) for manual assignments. */
  mapping: z.record(z.string().uuid()).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { files, mapping } = parsed.data;
  if (!files.length) return NextResponse.json({ error: 'no_files' }, { status: 400 });

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from('external_edit_batches')
    .select('id, order_id, status, manifest, returned_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'batch_not_found' }, { status: 404 });

  const manifest = (batch.manifest ?? []) as ManifestEntry[];
  const entryByPhotoId = new Map(manifest.map((e) => [e.photo_id, e]));

  const imported: { name: string; photo_id: string; parent_photo_id: string }[] = [];
  const unmatched: { name: string; storage_path: string; reason: 'no_match' | 'ambiguous' }[] = [];

  for (const f of files) {
    // Manual mapping wins; otherwise conservative stem matching.
    let entry: ManifestEntry | undefined;
    const mapped = mapping?.[f.name];
    if (mapped) {
      entry = entryByPhotoId.get(mapped);
      if (!entry) {
        return NextResponse.json(
          { error: 'mapping_photo_not_in_batch', filename: f.name },
          { status: 400 }
        );
      }
    } else {
      const m = matchReturnedFile(f.name, manifest);
      if (m.kind === 'match') entry = m.entry;
      else {
        unmatched.push({
          name: f.name,
          storage_path: f.storage_path,
          reason: m.kind === 'ambiguous' ? 'ambiguous' : 'no_match',
        });
        continue;
      }
    }

    const newId = uuidv4();
    const { error: insErr } = await admin.from('photos').insert({
      id: newId,
      order_id: batch.order_id,
      kind: 'processed',
      parent_photo_id: entry.photo_id,
      storage_path: f.storage_path,
      bucket: 'processed-photos',
      filename: f.name,
      mime_type: f.mime_type ?? 'image/jpeg',
      byte_size: f.byte_size,
      width: f.width ?? null,
      height: f.height ?? null,
      processing_status: 'complete',
      ai_provider: 'fotello',
      uploaded_by: user.id,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    entry.matched_photo_id = entry.photo_id;
    entry.imported_photo_id = newId;
    entry.imported_at = new Date().toISOString();
    imported.push({ name: f.name, photo_id: newId, parent_photo_id: entry.photo_id });
  }

  if (imported.length > 0) {
    const importedCount = manifest.filter((e) => e.imported_at).length;
    const { error: upErr } = await admin
      .from('external_edit_batches')
      .update({
        manifest: manifest as any,
        imported_count: importedCount,
        status: batch.status === 'closed' ? 'closed' : 'returned',
        returned_at: batch.returned_at ?? new Date().toISOString(),
      })
      .eq('id', params.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ imported, unmatched });
}
