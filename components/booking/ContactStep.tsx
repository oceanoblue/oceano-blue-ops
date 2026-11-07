'use client';

import { useState } from 'react';
import type { ContactData } from '@/lib/booking/types';

export function ContactStep({
  contact,
  onChange,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  contact: ContactData;
  onChange?: (c: ContactData) => void;
  onBack: () => void;
  onSubmit: (c: ContactData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [c, setC] = useState(contact);

  function updateContact(next: ContactData) {
    setC(next);
    onChange?.(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitting) onSubmit(c);
  }

  return (
    <form onSubmit={submit} aria-busy={submitting} className="card w-full p-6 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-ocean-950 text-center">Your contact details</h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        No account is needed to book. If you&apos;ve booked with us before, use the same email address.
      </p>

      <div className="mt-6 space-y-3">
        <div>
          <label className="label" htmlFor="contact-name">Full name <span className="text-rose-600" aria-hidden="true">*</span></label>
          <input
            id="contact-name" autoComplete="name" className="input text-base sm:text-sm"
            required maxLength={200} disabled={submitting}
            value={c.name} onChange={(e) => updateContact({ ...c, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-email">Email address <span className="text-rose-600" aria-hidden="true">*</span></label>
          <input
            className="input text-base sm:text-sm"
            id="contact-email" autoComplete="email" type="email"
            required maxLength={254} disabled={submitting}
            value={c.email}
            onChange={(e) => updateContact({ ...c, email: e.target.value })}
            placeholder="you@brokerage.com"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="contact-phone">Phone (optional)</label>
            <input
              id="contact-phone" autoComplete="tel" type="tel" className="input text-base sm:text-sm"
              maxLength={40} disabled={submitting}
              value={c.phone} onChange={(e) => updateContact({ ...c, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="contact-brokerage">Brokerage (optional)</label>
            <input
              id="contact-brokerage" autoComplete="organization" className="input text-base sm:text-sm"
              maxLength={200} disabled={submitting}
              value={c.brokerage} onChange={(e) => updateContact({ ...c, brokerage: e.target.value })}
            />
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}

      <p id="booking-submit-help" className="mt-6 text-sm text-slate-600">
        Your booking is sent when you select Submit booking. We&apos;ll email your booking details and confirmation.
      </p>
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className="btn-ghost" disabled={submitting} onClick={onBack}>← Back to date &amp; time</button>
        <button type="submit" className="btn-primary" aria-describedby="booking-submit-help" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit booking'}
        </button>
      </div>
    </form>
  );
}
