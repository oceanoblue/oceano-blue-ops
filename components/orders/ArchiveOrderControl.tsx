'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Archive/unarchive a shoot. Archived orders vanish from the orders list,
 *  overview, and schedule (nothing is deleted); the list's "Archived" filter
 *  shows them and this same button restores them. */
export function ArchiveOrderControl({
  orderId,
  archivedAt,
}: {
  orderId: string;
  archivedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = Boolean(archivedAt);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('orders')
        .update({ archived_at: archived ? null : new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
        title={archived ? 'Restore this shoot to the active lists' : 'Hide this shoot from the active lists (reversible)'}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : archived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
        {archived ? 'Unarchive' : 'Archive'}
      </button>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
