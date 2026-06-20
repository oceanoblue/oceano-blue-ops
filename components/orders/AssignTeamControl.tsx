'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Member = { id: string; full_name: string; role: string };

export function AssignTeamControl({
  orderId,
  photographerId,
  editorId,
  photographers,
  editors,
}: {
  orderId: string;
  photographerId: string | null;
  editorId: string | null;
  photographers: Member[];
  editors: Member[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function assign(field: 'photographer_id' | 'editor_id', value: string | null) {
    setError(null);
    start(async () => {
      const supabase = createClient();
      // Dynamic single-column patch; field is whitelisted by the param type.
      const { error: err } = await supabase
        .from('orders')
        .update({ [field]: value } as any)
        .eq('id', orderId);
      if (err) {
        // The double-book guard (SQLSTATE 23P01) blocks reassigning a
        // photographer onto a slot they're already booked for.
        const conflict = (err as any).code === '23P01' || /slot_unavailable/i.test(err.message);
        setError(
          conflict
            ? 'That photographer is already booked around this time.'
            : err.message
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Photographer</label>
        <select
          className="input"
          disabled={pending}
          value={photographerId ?? ''}
          onChange={(e) => assign('photographer_id', e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {photographers.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Editor</label>
        <select
          className="input"
          disabled={pending}
          value={editorId ?? ''}
          onChange={(e) => assign('editor_id', e.target.value || null)}
        >
          <option value="">Unassigned</option>
          {editors.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
