'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, CalendarDays, DollarSign } from 'lucide-react';

/** Shared tab bar for the photographer portal, dropped into each page's hero.
 *  Highlights the active section by pathname. */
const TABS = [
  { href: '/field/shoots', label: 'My shoots', icon: Camera },
  { href: '/field/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/field/pay', label: 'Get paid', icon: DollarSign },
];

export function FieldNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-white text-ink-900 shadow-soft'
                : 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20'
            }`}
          >
            <Icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
      <form action="/api/field/signout" method="POST" className="ml-0.5">
        <button className="px-2 text-sm text-ink-300 transition hover:text-white">Sign out</button>
      </form>
    </nav>
  );
}
