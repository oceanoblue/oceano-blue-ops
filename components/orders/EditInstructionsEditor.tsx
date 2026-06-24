'use client';

import { useState } from 'react';
import { Loader2, Check, AlertCircle, Wand2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

/**
 * Team-only editor for a reel order's `edit_instructions` DSL — the structured
 * plan (cards / clips / trims / lower-third) the Phase-2 Resolve compiler will
 * consume (handoff §8c). Stored as jsonb on reel_briefs; team RLS allows the
 * update, so we write directly with the browser client.
 */
export function EditInstructionsEditor({
  orderId,
  initial,
  starter,
}: {
  orderId: string;
  initial: Json | null;
  starter: Json;
}) {
  const seeded = initial ?? starter;
  const [text, setText] = useState(JSON.stringify(seeded, null, 2));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    let parsed: Json;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setStatus('error');
      setError('Invalid JSON — fix the syntax before saving.');
      return;
    }
    setSaving(true);
    setStatus('idle');
    const supabase = createClient();
    const { error: upErr } = await supabase
      .from('reel_briefs')
      .update({ edit_instructions: parsed })
      .eq('order_id', orderId);
    setSaving(false);
    if (upErr) {
      setStatus('error');
      setError(upErr.message);
    } else {
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }

  function loadStarter() {
    setText(JSON.stringify(starter, null, 2));
    setStatus('idle');
    setError(null);
  }

  return (
    <div className="space-y-3">
      <textarea
        className="input min-h-[260px] font-mono text-xs leading-relaxed"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save plan
        </button>
        <button onClick={loadStarter} className="btn-ghost inline-flex items-center gap-1.5">
          <Wand2 className="h-4 w-4" /> Reset to starter
        </button>
        {status === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}
