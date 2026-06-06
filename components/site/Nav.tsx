'use client';

import { useEffect, useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { NAV, SITE } from '@/lib/content';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ease-editorial ${
        scrolled ? 'text-ink' : 'text-paper'
      }`}
    >
      <div className="container-edge pt-3 sm:pt-4">
        <div
          className={`flex items-center justify-between rounded-full px-4 py-2.5 transition-all duration-500 ease-editorial sm:px-5 ${
            scrolled
              ? 'border border-ink/10 bg-paper/80 shadow-[0_10px_40px_rgba(0,0,0,0.07)] backdrop-blur-md'
              : 'border border-paper/15 bg-paper/5 backdrop-blur-sm'
          }`}
        >
        <a href="#top" className="group flex items-center gap-3" aria-label="Oceano Blue Media home">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-ocean text-white font-display text-lg leading-none transition-transform duration-500 ease-editorial group-hover:rotate-[20deg]">
            O
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-grotesk text-sm font-extrabold uppercase tracking-[0.18em]">
              Oceano Blue
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] opacity-60">
              Media Studio
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="link-underline font-grotesk text-sm font-medium uppercase tracking-wide"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href={SITE.phoneHref} className="font-mono text-xs tracking-wide opacity-70 hover:opacity-100">
            {SITE.phone}
          </a>
          <a href="#contact" className="btn-blue text-xs">
            Start a project <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <button
          className="grid h-10 w-10 place-items-center md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        </div>
      </div>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 top-0 z-40 flex flex-col bg-ink text-paper transition-all duration-500 ease-editorial md:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="container-edge flex items-center justify-between py-4">
          <span className="font-grotesk text-sm font-extrabold uppercase tracking-[0.18em]">
            Oceano Blue
          </span>
          <button
            className="grid h-10 w-10 place-items-center"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <nav className="container-edge flex flex-1 flex-col justify-center gap-2 pb-20">
          {NAV.map((item, i) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="font-display text-5xl font-light tracking-tight transition-colors hover:text-ocean-soft"
              style={{ transitionDelay: `${i * 30}ms` }}
            >
              {item.label}
            </a>
          ))}
          <div className="mt-10 flex flex-col gap-2 font-mono text-sm opacity-80">
            <a href={SITE.phoneHref}>{SITE.phone}</a>
            <a href={SITE.emailHref}>{SITE.email}</a>
            <span>{SITE.location}</span>
          </div>
        </nav>
      </div>
    </header>
  );
}
