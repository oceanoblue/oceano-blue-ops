import archiver from 'archiver';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { ManifestEntry } from '@/lib/external-edit/manifest';

export const dynamic = 'force-dynamic';

/**
 * Streams the export zip for an external edit batch: every manifest photo,
 * renamed to its sequence-named export_name, plus a manifest.json for
 * traceability. Prefers the untouched RAW original (raw_storage_path) when
 * one exists — Fotello merges brackets from RAW better than from previews.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from('external_edit_batches')
    .select('id, order_id, manifest')
    .eq('id', params.id)
    .maybeSingle();
  if (!batch) return new Response('Not found', { status: 404 });

  const manifest = (batch.manifest ?? []) as ManifestEntry[];
  const { data: order } = await admin
    .from('orders')
    .select('order_number')
    .eq('id', batch.order_id)
    .single();

  const { data: photos } = await admin
    .from('photos')
    .select('id, bucket, storage_path, raw_storage_path')
    .in('id', manifest.map((e) => e.photo_id));
  const byId = new Map(((photos ?? []) as any[]).map((p) => [p.id, p]));

  const stream = new ReadableStream({
    async start(controller) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (e) => controller.error(e));

      const included: ManifestEntry[] = [];
      for (const entry of manifest) {
        const p = byId.get(entry.photo_id);
        if (!p) continue;
        const path = p.raw_storage_path || p.storage_path;
        const { data } = await admin.storage.from(p.bucket).download(path);
        if (!data) continue;
        // Keep the manifest's stem but use the actual file's extension (the
        // export may ship the RAW while filename recorded a preview, or vice
        // versa). Matching on return is stem-based, so this stays consistent.
        const actualExt = path.split('.').pop()?.toLowerCase() || 'jpg';
        const name = entry.export_name.replace(/\.[^.]+$/, '') + '.' + actualExt;
        archive.append(Buffer.from(await data.arrayBuffer()), { name });
        included.push({ ...entry, export_name: name });
      }

      archive.append(
        Buffer.from(
          JSON.stringify(
            { batch_id: batch.id, order_id: batch.order_id, photos: included },
            null,
            2
          )
        ),
        { name: 'manifest.json' }
      );
      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="fotello-ob${order?.order_number ?? 'x'}-${params.id.slice(0, 8)}.zip"`,
    },
  });
}
