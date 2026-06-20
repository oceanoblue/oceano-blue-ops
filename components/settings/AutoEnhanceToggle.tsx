'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Org-wide "auto-enhance on upload" switch. When on (the default), merged HDR
 * bases and standalone JPEG singles are enhanced automatically once ready — no
 * manual "Run AI" click. Persists to the business_settings singleton.
 */
export function AutoEnhanceToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    setOn(next); // optimistic
    start(async () => {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('business_settings')
        .upsert(
          { id: true, auto_enhance_on_upload: next, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
      if (err) {
        setOn(!next); // revert
        setError(err.message);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-ocean-100 text-ocean-700 grid place-items-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-ocean-950">Auto-enhance on upload</div>
            <p className="text-sm text-slate-600 mt-0.5 max-w-prose">
              When on, every merged HDR base and standalone JPEG runs the signature enhance
              automatically once it&apos;s ready — no manual <em>Run AI</em> click. Each photo is
              enhanced once. Turn off to enhance only when you press Run AI.
            </p>
            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={pending}
          onClick={() => toggle(!on)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
            on ? 'bg-ocean-600' : 'bg-slate-300'
          } ${pending ? 'opacity-60' : ''}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
          {pending && (
            <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-slate-400" />
          )}
        </button>
      </div>
    </div>
  );
}
