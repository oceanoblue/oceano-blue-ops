'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Loader2 } from 'lucide-react';

/**
 * Triggers AI scene classification over the job's thumbnails (foundation).
 * No-ops gracefully if OPENAI_API_KEY isn't configured server-side.
 */
export function ClassifyButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/re-photo/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Classification failed: ${json.error ?? res.status}`);
      } else if (json.skipped) {
        alert('AI scene classification is not configured (no OPENAI_API_KEY). Heuristic + manual tagging still work.');
      } else {
        alert(`Classified ${json.classified} of ${json.candidates} unlabelled photo(s).`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-secondary" disabled={busy} onClick={run} title="AI scene classification (uses thumbnails)">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      Auto-classify scenes
    </button>
  );
}
