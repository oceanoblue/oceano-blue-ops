'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';

/**
 * Publish-approval gate (decision #2). Shown when an episode is awaiting human
 * sign-off after the unlisted YouTube upload.
 */
export function ApprovalPanel({ episodeId }: { episodeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm('Send this episode back for revision?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/automations/podcast/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: episodeId, decision }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Failed: ${j.error ?? res.status}`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card border border-amber-300 bg-amber-50 p-5">
      <h2 className="font-semibold text-amber-900">Publish approval required</h2>
      <p className="mt-1 text-sm text-amber-800">
        The episode is uploaded to YouTube as <strong>unlisted</strong>. Review the video and the
        generated copy below, then approve to publish publicly / finalize delivery, or send it back.
      </p>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => decide('approve')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approve &amp; publish
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => decide('reject')}>
          <X className="h-4 w-4" /> Request changes
        </button>
      </div>
    </div>
  );
}
