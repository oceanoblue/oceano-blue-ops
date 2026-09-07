'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/ui/BrandLogo';

export function PortalSignIn() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);

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

  // Alternative to tapping the emailed link: type the 6-digit code from the
  // same email. Essential in the installed (home-screen) app, where the link
  // would open the separate browser instead of the app.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setCodeMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    if (error) {
      setVerifying(false);
      setCodeMsg(
        error.message.toLowerCase().includes('expired') || error.message.toLowerCase().includes('invalid')
          ? 'That code didn’t match — double-check it, or request a fresh email.'
          : error.message
      );
      return;
    }
    // Bind the clients row to this auth user (same as the link callback).
    // Bind whichever row shares this email (client and/or contractor), then let
    // the server route to the right portal by identity.
    await Promise.all([
      supabase.rpc('link_client_account').then(() => null, () => null),
      supabase.rpc('link_contractor_account').then(() => null, () => null),
    ]);
    window.location.href = '/portal';
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
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                {msg} Tap the link on this device — or enter the one-time code from the same email
                below.
              </div>
              <form onSubmit={verifyCode} className="space-y-3">
                {/* Code length is a Supabase project setting (6–10 digits) — accept
                    any of them rather than hardcoding one. */}
                <input
                  className="input text-center font-mono text-lg tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="••••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  className="btn-primary w-full inline-flex items-center justify-center gap-2"
                  disabled={verifying || code.trim().length < 6}
                >
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Sign in with code
                </button>
                {codeMsg && <p className="text-sm text-rose-600">{codeMsg}</p>}
              </form>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setCode('');
                  setCodeMsg(null);
                }}
                className="text-xs text-slate-500 underline-offset-2 hover:underline"
              >
                Use a different email
              </button>
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
          <p className="mt-2 text-xs text-slate-500">
            Photographer? Sign in here with the email the office has for you — you&rsquo;ll land
            on your shoots.
          </p>
        </div>
      </div>
    </div>
  );
}
