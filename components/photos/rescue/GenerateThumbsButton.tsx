'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageDown, Loader2 } from 'lucide-react';

/**
 * Backfills thumbnails for already-indexed local assets via a worker task.
 * Requires an online local worker with access to the files.
 */
export function GenerateThumbsButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/worker/tasks/enqueue-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Failed: ${json.error ?? res.status}`);
      } else if (json.assets === 0) {
        alert('No local photos are missing thumbnails.');
      } else {
        alert(`Queued thumbnails for ${json.assets} photo(s). An online worker will generate them shortly — refresh in a bit.`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-secondary" disabled={busy} onClick={run} title="Generate thumbnails for indexed local assets (needs an online worker)">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
      Generate thumbnails
    </button>
  );
}
