'use client';

import { useTransition } from 'react';
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

  function assign(field: 'photographer_id' | 'editor_id', value: string | null) {
    start(async () => {
      const supabase = createClient();
      // Dynamic single-column patch; field is whitelisted by the param type.
      await supabase.from('orders').update({ [field]: value } as any).eq('id', orderId);
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
    </div>
  );
}
