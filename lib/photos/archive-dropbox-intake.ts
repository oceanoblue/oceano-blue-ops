import { createAdminClient } from '@/lib/supabase/server';
import { isDropboxConfigured, archiveIntakePath, ensureFolder, movePath } from '@/lib/integrations/dropbox';

/**
 * Move the Dropbox intake folder of long-delivered orders into a "/Photo
 * Intake/_Archive" tree so the working intake area stays clean. RAWs stay in
 * Dropbox (the archive) — nothing is deleted. A grace window
 * (DROPBOX_ARCHIVE_AFTER_DAYS, default 14) leaves recently delivered orders
 * alone in case they're re-processed. Bounded per run so a cron stays fast.
 */
export async function archiveDeliveredIntakeFolders(): Promise<
  { archived: number; considered: number; failures: Array<{ id: string; error: string }> } | { skipped: string }
> {
  if (!isDropboxConfigured()) return { skipped: 'dropbox_not_configured' };

  const days = Number(process.env.DROPBOX_ARCHIVE_AFTER_DAYS ?? 14);
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const admin = createAdminClient() as any;

  const { data: orders } = await admin
    .from('orders')
    .select('id, dropbox_intake_path')
    .eq('status', 'delivered')
    .lt('delivered_at', cutoff)
    .not('dropbox_intake_path', 'is', null)
    .is('dropbox_archived_at', null)
    .limit(25);

  let archived = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const o of orders ?? []) {
    const { archiveRoot, dest } = archiveIntakePath(o.dropbox_intake_path);
    await ensureFolder(archiveRoot);
    const res = await movePath(o.dropbox_intake_path, dest);
    // 'not_found' = already gone; stamp it so we stop retrying.
    if (res.status === 'moved' || res.status === 'not_found') {
      await admin.from('orders').update({ dropbox_archived_at: new Date().toISOString() }).eq('id', o.id);
      archived++;
    } else if (res.status === 'failed') {
      failures.push({ id: o.id, error: res.error });
    }
  }

  return { archived, considered: (orders ?? []).length, failures };
}
