'use client';

import { useState } from 'react';
import { Building2, Home, Camera, ArrowUpRight, Copy, Check, LifeBuoy } from 'lucide-react';

type Accent = 'ocean' | 'amber' | 'teal';

const ACCENT: Record<Accent, { tile: string; ring: string; dot: string }> = {
  ocean: { tile: 'bg-ocean-50 text-ocean-700', ring: 'hover:border-ocean-300', dot: 'bg-ocean-500' },
  amber: { tile: 'bg-amber-50 text-amber-700', ring: 'hover:border-amber-300', dot: 'bg-amber-500' },
  teal: { tile: 'bg-teal-50 text-teal-700', ring: 'hover:border-teal-300', dot: 'bg-teal-500' },
};

const GUIDES: {
  key: string; href: string; icon: typeof Home; accent: Accent;
  title: string; audience: string; desc: string; share: boolean;
}[] = [
  {
    key: 'admin', href: '/guides/admin.html', icon: Building2, accent: 'ocean',
    title: 'Admin Guide', audience: 'For you & the office',
    desc: 'Access the dashboard, book a shoot in one screen, assign photographers, and deliver media — the full studio workflow.',
    share: false,
  },
  {
    key: 'realtor', href: '/guides/realtor.html', icon: Home, accent: 'amber',
    title: 'Realtor Guide', audience: 'For your clients',
    desc: 'How agents open their private Media Room to view, download, and share a listing’s photos, 360° tours, floor plans, and video.',
    share: true,
  },
  {
    key: 'photographer', href: '/guides/photographer.html', icon: Camera, accent: 'teal',
    title: 'Photographer Guide', audience: 'For your shooters',
    desc: 'How contractors sign in to the field portal, accept shoots, upload the RAWs, and submit their weekly pay request.',
    share: true,
  },
];

export function GuideCards() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyLink(href: string, key: string) {
    const url = `${window.location.origin}${href}`;
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
  }

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {GUIDES.map((g) => {
        const a = ACCENT[g.accent];
        const Icon = g.icon;
        return (
          <div
            key={g.key}
            className={`card flex flex-col p-6 transition-colors ${a.ring}`}
          >
            <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${a.tile}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="mb-1 inline-flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">{g.audience}</span>
            </div>
            <h3 className="font-display text-lg font-semibold text-ink-900">{g.title}</h3>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">{g.desc}</p>

            <div className="mt-5 flex items-center gap-2">
              <a href={g.href} target="_blank" rel="noreferrer" className="btn-primary inline-flex items-center gap-1.5 text-sm">
                Open guide <ArrowUpRight className="h-4 w-4" />
              </a>
              {g.share && (
                <button
                  onClick={() => copyLink(g.href, g.key)}
                  className="btn-secondary inline-flex items-center gap-1.5 text-sm"
                  title="Copy a shareable link"
                >
                  {copied === g.key ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied === g.key ? 'Copied' : 'Copy link'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HelpFootnote() {
  return (
    <div className="card flex items-start gap-3 p-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ocean-50 text-ocean-700">
        <LifeBuoy className="h-4 w-4" />
      </span>
      <p className="text-sm text-slate-600">
        These guides live on your own domain at <span className="font-mono text-ink-800">app.oceanoblue.net/guides</span> — they’re
        safe to send straight to agents and photographers. The Realtor and Photographer guides are written for those audiences;
        use <b>Copy link</b> to share them.
      </p>
    </div>
  );
}
