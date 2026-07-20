'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/ui/BrandLogo';

export default function PortalLanding() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
    if (error) setMsg(error.message);
    else {
      setSent(true);
      setMsg('Check your email for a sign-in link.');
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-ink-900 to-ink-950 px-6 py-12">
      {/* ambient ocean glows */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-ocean-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-ocean-700/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6">
          <BrandLogo variant="white" className="h-9 w-auto" />
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ocean-300">
            Client Portal
          </div>
        </div>

        <div className="rounded-2xl bg-white/95 p-8 shadow-lift backdrop-blur">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ocean-950">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to view your listings, download finished photos, and book new shoots.
          </p>

          {sent ? (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {msg} Open it on this device to finish signing in.
            </div>
          ) : (
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
              {msg && !sent && <p className="text-sm text-rose-600">{msg}</p>}
            </form>
          )}

          <p className="mt-6 text-xs text-slate-500">
            New to Oceano Blue?{' '}
            <a className="font-medium text-ocean-700 hover:underline" href="/book">
              Book a shoot
            </a>{' '}
            first — your account is created automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
