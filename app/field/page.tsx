'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BrandMark } from '@/components/ui/BrandLogo';

/** Contractor photographer sign-in. Magic-link only — same passwordless flow
 *  as the client portal. The email must match a contractor the office added. */
export default function FieldLanding() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/field/auth/callback` },
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
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ocean-500/20 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <BrandMark className="h-9 w-9" />
          </div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-ocean-300">
            Oceano Blue · Photographers
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
            Field portal
          </h1>
          <p className="mt-2 text-sm text-ink-300">
            Log your shoots, upload the RAWs, track your properties.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl bg-white/5 p-6 text-center ring-1 ring-white/10">
            <p className="text-sm text-ink-200">{msg}</p>
            <p className="mt-2 text-xs text-ink-400">
              Open it on this device to sign in. You can close this tab.
            </p>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full rounded-lg border-0 bg-white/10 px-4 py-3 text-white placeholder-ink-400 ring-1 ring-white/15 focus:ring-2 focus:ring-ocean-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-ink-950 transition hover:-translate-y-px hover:shadow-lift disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Email me a sign-in link
            </button>
            {msg && <p className="text-center text-xs text-rose-300">{msg}</p>}
            <p className="pt-2 text-center text-xs text-ink-400">
              New here? Ask the office to add you as a photographer first.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
