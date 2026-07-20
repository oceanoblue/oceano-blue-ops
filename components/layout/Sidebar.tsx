'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { BrandMark } from '@/components/ui/BrandLogo';
import { NAV_GROUPS, isActive, type NavGroupDef } from './nav-items';

const COLLAPSE_KEY = 'obm.nav.collapsed';

function NavGroup({ group, pathname }: { group: NavGroupDef; pathname: string }) {
  // Collapsible groups remember their state; a group auto-opens when it holds
  // the current page so the active item is never hidden.
  const holdsActive = group.items.some((i) => isActive(pathname, i.href));
  const [open, setOpen] = useState(!group.collapsible);
  useEffect(() => {
    if (!group.collapsible) return;
    if (holdsActive) {
      setOpen(true);
      return;
    }
    try {
      const saved = localStorage.getItem(`${COLLAPSE_KEY}.${group.title}`);
      if (saved !== null) setOpen(saved === 'open');
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdsActive]);

  function toggle() {
    if (!group.collapsible) return;
    setOpen((v) => {
      try {
        localStorage.setItem(`${COLLAPSE_KEY}.${group.title}`, v ? 'closed' : 'open');
      } catch {
        /* private mode */
      }
      return !v;
    });
  }

  return (
    <div className="space-y-0.5">
      {group.collapsible ? (
        <button
          onClick={toggle}
          className="flex w-full items-center justify-between px-3 pt-5 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400 hover:text-ink-200 transition-colors"
        >
          {group.title}
          <ChevronRight
            className={cn('h-3 w-3 transition-transform duration-200 ease-swift', open && 'rotate-90')}
          />
        </button>
      ) : (
        <div className="px-3 pt-5 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
          {group.title}
        </div>
      )}
      {open &&
        group.items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-swift',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-ink-300 hover:bg-white/5 hover:text-white hover:translate-x-0.5'
              )}
            >
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-ocean-400 transition-all duration-300 ease-spring',
                  active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'
                )}
              />
              <Icon
                className={cn(
                  'h-4 w-4 transition-colors duration-200',
                  active ? 'text-ocean-400' : 'text-ink-400 group-hover:text-ocean-300'
                )}
              />
              {label}
            </Link>
          );
        })}
    </div>
  );
}

/** Shared nav body — rendered in the desktop rail AND the mobile drawer. */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-6">
      {NAV_GROUPS.map((g) => (
        <NavGroup key={g.title} group={g} pathname={pathname} />
      ))}
    </nav>
  );
}

export function SidebarBrand() {
  return (
    <div className="px-5 py-6">
      <Link href="/dashboard" className="group flex items-center gap-3">
        <BrandMark className="h-9 w-auto transition-transform duration-300 ease-spring group-hover:scale-105 group-hover:rotate-3" />
        <div>
          <div className="font-display text-[15px] font-semibold tracking-tight text-white">
            Oceano Blue
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            Production OS
          </div>
        </div>
      </Link>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col bg-ink-950 text-white">
      <SidebarBrand />
      <SidebarNav />
      <div className="border-t border-white/10 px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
        Oceano Blue Media
      </div>
    </aside>
  );
}
