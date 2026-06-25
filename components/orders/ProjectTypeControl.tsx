'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PHOTO_PROFILES, PROJECT_TYPES, profileFor, type ProjectType } from '@/lib/photos/profiles';

/**
 * Sets the order's photo production profile. The choice drives the finishing
 * grade (e.g. 'sober' for architectural/interior — accurate, not HDR-pushed)
 * and the suggested delivery preset. Applies to enhance jobs run after it's set.
 */
export function ProjectTypeControl({
  orderId,
  projectType,
}: {
  orderId: string;
  projectType: string | null | undefined;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = profileFor(projectType);

  function setType(next: ProjectType) {
    if (next === current.id) return;
    start(async () => {
      const supabase = createClient();
      await supabase.from('orders').update({ project_type: next } as any).eq('id', orderId);
      router.refresh();
    });
  }

  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-slate-500 mb-1">Photo profile</label>
      <select
        value={current.id}
        disabled={pending}
        onChange={(e) => setType(e.target.value as ProjectType)}
        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
      >
        {PROJECT_TYPES.map((t) => (
          <option key={t} value={t}>
            {PHOTO_PROFILES[t].label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">{current.description}</p>
    </div>
  );
}
