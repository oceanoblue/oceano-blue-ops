'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Keep native POST/redirect behavior, with immediate repeat-submit protection. */
export function ResponseForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reset = () => { submitting.current = false; setBusy(false); };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (
    <form action={action} method="POST" className={className} aria-busy={busy} onSubmit={event => {
      if (submitting.current) { event.preventDefault(); return; }
      submitting.current = true;
      setBusy(true);
    }}>
      {/* Inert prevents extra interactions without omitting fields from the POST. */}
      <div inert={busy} className={busy ? 'space-y-3 opacity-60' : 'space-y-3'}>{children}</div>
      {busy && <p role="status" className="mt-3 text-sm font-medium text-ocean-700">Saving your response…</p>}
    </form>
  );
}
