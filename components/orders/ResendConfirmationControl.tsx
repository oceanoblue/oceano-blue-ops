'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

/** Resend the booking confirmation to the client's current email address. */
export function ResendConfirmationControl({ orderId, email }: { orderId: string; email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!email) return;
    if (!window.confirm(`Send the booking confirmation to ${email}?`)) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      const r = await fetch(`/api/orders/${orderId}/resend-confirmation`, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `error_${r.status}`);
      setMessage(`Confirmation sent to ${data.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={resend}
        disabled={busy || !email}
        className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
        title={email ? `Email the booking confirmation to ${email}` : 'Add a client email first'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Resend confirmation
      </button>
      {message && <p role="status" className="mt-1 text-xs text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
