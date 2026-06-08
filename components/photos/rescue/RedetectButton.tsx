'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Loader2 } from 'lucide-react';

/** Re-run bracket detection over the job's currently-ungrouped photos. */
export function RedetectButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/re-photo/redetect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Failed: ${json.error ?? res.status}`);
      } else if (json.considered === 0) {
        alert('No ungrouped photos to detect.');
      } else {
        alert(`Detected ${json.groups} bracket group(s) from ${json.considered} ungrouped photo(s); ${json.needs_review} need review.`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-secondary" disabled={busy} onClick={run} title="Re-run bracket detection over ungrouped photos">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      Re-detect brackets
    </button>
  );
}
