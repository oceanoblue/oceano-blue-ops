'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2 } from 'lucide-react';

const PUBLISH_MESSAGE: Record<string, string> = {
  triggered: 'Approved — the publish scenario is flipping the video to public.',
  not_configured:
    'Approved and recorded. Auto-publish is not configured (MAKE_PUBLISH_WEBHOOK_URL) — flip the video to public in YouTube Studio.',
  no_youtube: 'Approved and recorded — no YouTube link on this episode to publish.',
  failed: 'Approved, but the publish webhook failed. Click Approve again to retry, or flip the video manually.',
};

/**
 * Publish-approval gate (decision #2). Shown when an episode is awaiting human
 * sign-off after the unlisted YouTube upload. Approving fires the Make publish
 * scenario (Phase 2) — the click here is the owner approval.
 */
export function ApprovalPanel({ episodeId }: { episodeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm('Send this episode back for revision?')) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/automations/podcast/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episode_id: episodeId, decision }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`Failed: ${j.error ?? res.status}`);
      } else {
        if (decision === 'approve' && j.publish) setInfo(PUBLISH_MESSAGE[j.publish] ?? null);
        router.refresh();
      }
    } catch {
      setError('Failed: network error');
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
      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {info}
        </div>
      )}
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
