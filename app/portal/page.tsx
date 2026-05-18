'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PortalLanding() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/portal/auth/callback` },
    });
    setBusy(false);
    setMsg(error ? error.message : 'Check your email for a sign-in link.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="card w-full max-w-md p-8">
        <div className="text-xs font-semibold uppercase tracking-wide text-ocean-700">Oceano Blue</div>
        <h1 className="mt-1 text-2xl font-semibold text-ocean-950">Welcome</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to view your listings, download finished photos, and book new shoots.
        </p>

        <form onSubmit={sendLink} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              required
              placeholder="you@brokerage.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>

        {msg && <p className="mt-4 text-sm text-slate-700">{msg}</p>}

        <p className="mt-6 text-xs text-slate-500">
          New to Oceano Blue? <a className="text-ocean-700 hover:underline" href="/book">Book a shoot</a> first — your account will be created automatically.
        </p>
      </div>
    </div>
  );
}
