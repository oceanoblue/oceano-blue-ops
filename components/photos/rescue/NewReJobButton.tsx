'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';

export function NewReJobButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    const title = window.prompt('New real estate photo job — title / address:');
    if (!title) return;
    setBusy(true);
    try {
      const res = await fetch('/api/re-photo/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`Could not create job: ${json.error ?? res.status}`);
        return;
      }
      router.push(`/dashboard/jobs/${json.job_id}/photo-rescue`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-primary" disabled={busy} onClick={create}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      New RE photo job
    </button>
  );
}
