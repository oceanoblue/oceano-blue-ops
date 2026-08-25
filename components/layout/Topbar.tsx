'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plus, ChevronDown, UserRound, LifeBuoy } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { MobileNav } from './MobileNav';

/**
 * App chrome that earns its 56px: mobile nav trigger, the one action the team
 * reaches for all day (New order), and a compact account menu — instead of a
 * static "Welcome back" line.
 */
export function Topbar({ userEmail }: { userEmail?: string | null }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initial = (userEmail ?? '?').charAt(0).toUpperCase();

  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-ink-100/80 px-4 sm:px-6">
      <div className="flex items-center gap-2 min-w-0">
        <MobileNav />
        <Link href="/dashboard" className="md:hidden">
          <BrandLogo variant="dark" className="h-6 w-auto" />
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/dashboard/orders/new" className="btn-primary hidden sm:inline-flex">
          <Plus className="h-4 w-4" /> New shoot
        </Link>
        <Link
          href="/dashboard/orders/new"
          className="btn-primary sm:hidden p-2"
          aria-label="New shoot"
        >
          <Plus className="h-4 w-4" />
        </Link>

        <Link
          href="/dashboard/help"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-ink-50 hover:text-ink-900 transition-colors"
        >
          <LifeBuoy className="h-4 w-4" /> Help
        </Link>
        <Link
          href="/dashboard/help"
          className="sm:hidden grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-ink-50 hover:text-ink-900"
          aria-label="Help & guides"
        >
          <LifeBuoy className="h-4 w-4" />
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full p-1 pr-2 hover:bg-ink-50 transition-colors"
            aria-label="Account menu"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-900 text-[12px] font-semibold text-white">
              {initial}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white p-1.5 shadow-lift ring-1 ring-ink-100 animate-scale-in origin-top-right">
              <div className="flex items-center gap-2 px-2.5 py-2 border-b border-ink-100/80 mb-1">
                <UserRound className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate font-mono text-[12px] text-ink-700">{userEmail ?? '—'}</span>
              </div>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-ink-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
