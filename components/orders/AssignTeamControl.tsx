'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Member = { id: string; full_name: string; role: string };

/**
 * Editor assignment for an order. Photographer assignment moved to the unified
 * AssignShooterControl (team + contractors in one picker); this handles the
 * editor, a distinct role.
 */
export function AssignTeamControl({
  orderId,
  editorId,
  editors,
}: {
  orderId: string;
  editorId: string | null;
  editors: Member[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function assign(value: string | null) {
    setError(null);
    start(async () => {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('orders')
        .update({ editor_id: value } as any)
        .eq('id', orderId);
      if (err) {
        setError(err.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <label className="label">Editor</label>
      <select
        className="input"
        disabled={pending}
        value={editorId ?? ''}
        onChange={(e) => assign(e.target.value || null)}
      >
        <option value="">Unassigned</option>
        {editors.map((e) => (
          <option key={e.id} value={e.id}>{e.full_name}</option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
