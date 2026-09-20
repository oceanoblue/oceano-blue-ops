'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function GalleryWatermarkToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function toggle() {
    const next = !enabled;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error } = await createClient().from('business_settings')
        .update({ gallery_watermark_enabled: next }).eq('id', true)
        .select('gallery_watermark_enabled').single();
      if (error || !data) throw new Error('Could not save the gallery setting. Please try again.');
      setEnabled(data.gallery_watermark_enabled);
      setNotice(`Saved. Watermarks are ${data.gallery_watermark_enabled ? 'on' : 'off'} for all unpaid galleries.`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the gallery setting.'); }
    finally { setBusy(false); }
  }
  return (
    <section className="card p-6" aria-labelledby="gallery-settings-title">
      <h2 id="gallery-settings-title" className="mb-4 font-semibold text-slate-900">Client galleries</h2>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 id="gallery-watermark-label" className="font-medium text-ocean-950">Watermark unpaid previews</h3>
          <p id="gallery-watermark-description" className="mt-1 max-w-xl text-sm text-slate-600">One setting for all galleries. Turn on to show the Oceano Blue watermark, or off for clean previews. Downloads always require payment for unpaid orders.</p>
          <p className="mt-2 text-xs text-slate-500">Applies when a gallery is opened or refreshed. Paid galleries stay watermark-free.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-slate-600">{busy ? 'Saving…' : enabled ? 'On' : 'Off'}</span>
          <button type="button" role="switch" aria-checked={enabled} aria-labelledby="gallery-watermark-label" aria-describedby="gallery-watermark-description" disabled={busy} onClick={toggle}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ocean-600 ${enabled ? 'bg-ocean-600' : 'bg-slate-300'} disabled:opacity-60`}>
            <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
