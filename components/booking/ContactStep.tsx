'use client';

import { useState } from 'react';
import type { ContactData } from '@/lib/booking/types';

export function ContactStep({
  contact,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  contact: ContactData;
  onBack: () => void;
  onSubmit: (c: ContactData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [c, setC] = useState(contact);
  const [mode, setMode] = useState<'guest' | 'signin'>('guest');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'signin') {
      // For sign-in flow we just collect email and let portal handle it after order.
      onSubmit({ ...c, name: c.name || c.email.split('@')[0] });
    } else {
      onSubmit(c);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950 text-center">Share your contact details</h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        Continue as guest or sign in to confirm your booking
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          className={`rounded-md py-1.5 text-sm font-medium transition ${mode === 'guest' ? 'bg-white shadow-sm text-ocean-900' : 'text-slate-600'}`}
          onClick={() => setMode('guest')}
        >
          Continue as guest
        </button>
        <button
          type="button"
          className={`rounded-md py-1.5 text-sm font-medium transition ${mode === 'signin' ? 'bg-white shadow-sm text-ocean-900' : 'text-slate-600'}`}
          onClick={() => setMode('signin')}
        >
          Sign in
        </button>
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <label className="label">Email <span className="text-rose-600">*</span></label>
          <input
            className="input"
            type="email"
            required
            value={c.email}
            onChange={(e) => setC({ ...c, email: e.target.value })}
            placeholder="you@brokerage.com"
          />
        </div>
        {mode === 'guest' && (
          <>
            <div>
              <label className="label">Full name <span className="text-rose-600">*</span></label>
              <input className="input" required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Phone</label>
                <input className="input" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Brokerage</label>
                <input className="input" value={c.brokerage} onChange={(e) => setC({ ...c, brokerage: e.target.value })} />
              </div>
            </div>
          </>
        )}
        {mode === 'signin' && (
          <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md">
            After we confirm your booking we'll email you a sign-in link to view your listings and download photos.
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      <div className="mt-6 flex gap-2 justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>← Back</button>
        <button type="submit" className="btn-primary" disabled={submitting || !c.email}>
          {submitting ? 'Confirming…' : 'Confirm booking'}
        </button>
      </div>
    </form>
  );
}
