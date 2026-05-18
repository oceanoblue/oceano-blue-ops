'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const ITEMS = [
  { href: '/dashboard/settings', label: 'Team' },
  { href: '/dashboard/settings/availability', label: 'Availability' },
  { href: '/dashboard/settings/integrations', label: 'Integrations' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-slate-200 mb-6">
      {ITEMS.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              'px-3 py-2 text-sm border-b-2 -mb-px',
              active
                ? 'border-ocean-700 text-ocean-900 font-medium'
                : 'border-transparent text-slate-600 hover:text-ocean-900'
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
