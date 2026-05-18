'use client';

import { useState } from 'react';
import Link from 'next/link';

const SERVICE_CHOICES: Array<{ id: string; label: string; price: string }> = [
  { id: 'photos_hdr', label: 'HDR photos', price: '$245' },
  { id: 'photos_standard', label: 'Standard photos', price: '$195' },
  { id: 'twilight', label: 'Twilight shoot', price: '$150' },
  { id: 'drone_photos', label: 'Drone photos', price: '$125' },
  { id: 'drone_video', label: 'Drone video', price: '$200' },
  { id: 'video_walkthrough', label: 'Cinematic walkthrough', price: '$350' },
  { id: 'virtual_tour', label: 'Virtual tour', price: '$125' },
  { id: 'floor_plan', label: 'Floor plan', price: '$95' },
  { id: 'matterport', label: 'Matterport 3D tour', price: '$295' },
  { id: 'rush_delivery', label: '24-hour rush delivery', price: '+$95' },
];

const STATES = ['NJ', 'NY', 'PA', 'CT', 'FL'];

export default function BookPage() {
  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_brokerage: '',
    address_line1: '',
    city: '',
    state: 'NJ',
    zip: '',
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1800,
    requested_at: '',
    services: ['photos_hdr'],
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleService(id: string) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(id) ? f.services.filter((s) => s !== id) : [...f.services, id],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch('/api/booking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        sqft: Number(form.sqft),
        requested_at: new Date(form.requested_at).toISOString(),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const data = await r.json();
      setErr(data.error || 'Booking failed');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-semibold text-ocean-900">Shoot requested 🎉</h1>
          <p className="mt-2 text-slate-600">
            Thanks! Our team will confirm the date and details by email within a few hours.
          </p>
          <Link href="/" className="btn-secondary mt-6 inline-flex">Back home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-2xl px-6">
        <Link href="/" className="text-sm text-ocean-700 hover:underline">← Back</Link>
        <h1 className="mt-4 text-3xl font-semibold text-ocean-950">Book a shoot</h1>
        <p className="mt-2 text-sm text-slate-600">
          Fill this out and we'll confirm by email within a few hours.
        </p>

        <form onSubmit={submit} className="card mt-8 p-6 space-y-6">
          <fieldset className="space-y-4">
            <legend className="font-semibold text-slate-900">Your details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input className="input" required value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></Field>
              <Field label="Email"><input className="input" type="email" required value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></Field>
              <Field label="Phone"><input className="input" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} /></Field>
              <Field label="Brokerage"><input className="input" value={form.client_brokerage} onChange={(e) => setForm({ ...form, client_brokerage: e.target.value })} /></Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-semibold text-slate-900">Property</legend>
            <Field label="Address"><input className="input" required value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City"><input className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="State">
                <select className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="ZIP"><input className="input" required value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bedrooms"><input className="input" type="number" min={0} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: +e.target.value })} /></Field>
              <Field label="Bathrooms"><input className="input" type="number" step="0.5" min={0} value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: +e.target.value })} /></Field>
              <Field label="Sq ft"><input className="input" type="number" min={0} value={form.sqft} onChange={(e) => setForm({ ...form, sqft: +e.target.value })} /></Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-semibold text-slate-900">Shoot date</legend>
            <Field label="Preferred date / time">
              <input className="input" type="datetime-local" required value={form.requested_at} onChange={(e) => setForm({ ...form, requested_at: e.target.value })} />
            </Field>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-semibold text-slate-900">Services</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SERVICE_CHOICES.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer ${
                    form.services.includes(s.id) ? 'border-ocean-500 bg-ocean-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.services.includes(s.id)}
                      onChange={() => toggleService(s.id)}
                    />
                    <span className="text-sm">{s.label}</span>
                  </div>
                  <span className="text-xs text-slate-500">{s.price}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Anything else we should know?">
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          {err && <p className="text-sm text-rose-700">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Request shoot'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
