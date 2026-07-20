'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/ui/BrandLogo';

export default function LoginPage() {
  // useSearchParams() must live inside a Suspense boundary in Next.js 14
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMsg(error.message);
    } else {
      router.push(next);
      router.refresh();
    }
  }

  async function sendMagicLink() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    setMsg(error ? error.message : 'Check your inbox for a sign-in link.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="card w-full max-w-sm p-8">
        <BrandLogo variant="dark" className="mb-6 h-8 w-auto" />
        <h1 className="text-2xl font-semibold text-ocean-900">Team sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Use your Oceano Blue email.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || !email || !password}>
            Sign in
          </button>
          <button
            type="button"
            onClick={sendMagicLink}
            className="btn-ghost w-full text-sm"
            disabled={busy || !email}
          >
            Email me a sign-in link
          </button>
        </form>
        {msg && <p className="mt-4 text-sm text-rose-700">{msg}</p>}
      </div>
    </div>
  );
}
