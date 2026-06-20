'use client';

import { useState, type ReactNode } from 'react';

/**
 * Lightweight client tab bar for detail pages. Panels are server-rendered
 * ReactNodes passed in as `content`, so a server page can compose rich panels
 * and hand them to this client shell for the (client-only) active-tab state.
 */
export interface TabDef {
  id: string;
  label: ReactNode;
  /** Optional count badge shown next to the label. */
  count?: number;
  content: ReactNode;
}

export function Tabs({ tabs, initialId }: { tabs: TabDef[]; initialId?: string }) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`relative -mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'border-ocean-600 text-ocean-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    isActive ? 'bg-ocean-100 text-ocean-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
