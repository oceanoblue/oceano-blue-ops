'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { SidebarBrand, SidebarNav } from './Sidebar';

/**
 * Mobile navigation. Before this, the sidebar was `hidden md:flex` with no
 * fallback — on a phone the app had NO navigation at all. A hamburger in the
 * topbar opens a slide-over drawer that reuses the exact same nav tree.
 *
 * The drawer is portaled to <body>: it renders inside the topbar, whose
 * `glass` backdrop-blur makes the header the containing block for
 * position:fixed descendants — without the portal, `inset-0` resolves to the
 * 56px header box and the drawer is clipped to a strip.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer; so does Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Crossing the md breakpoint (e.g. rotating a phone to landscape) hides
    // the drawer via md:hidden — close it too, or the body scroll lock below
    // outlives the invisible drawer and the page can't scroll.
    const desktop = window.matchMedia('(min-width: 768px)');
    function onDesktop(e: MediaQueryListEvent) {
      if (e.matches) setOpen(false);
    }
    if (desktop.matches) {
      setOpen(false);
      return;
    }
    window.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onDesktop);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onDesktop);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-ink-50"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm animate-fade-in"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink-950 text-white shadow-lift animate-rise">
              <div className="flex items-center justify-between pr-3">
                <SidebarBrand />
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg text-ink-300 hover:bg-white/10 hover:text-white"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarNav />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
