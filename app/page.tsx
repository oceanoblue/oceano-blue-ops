import Link from 'next/link';
import {
  CalendarClock,
  Camera,
  Wand2,
  Eye,
  Send,
  Mic,
  Images,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';

export default function HomePage() {
  return (
    <div className="grain relative min-h-screen overflow-hidden bg-ink-950 text-white">
      {/* Ambient ocean glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-56 left-1/3 h-[38rem] w-[68rem] -translate-x-1/2 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(12,141,233,0.5), rgba(12,141,233,0.08) 55%, transparent 72%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-64 right-[-16rem] h-[34rem] w-[54rem] opacity-20"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(124,198,252,0.35), transparent 68%)',
        }}
      />

      {/* ─── Nav ─────────────────────────────────────────────── */}
      <header className="relative z-10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <BrandLogo variant="white" className="h-7 w-auto sm:h-8" />
            <span className="hidden rounded-full bg-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ocean-300 ring-1 ring-white/10 sm:inline">
              Production OS
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-4 py-2 text-sm font-medium text-ink-200 transition-colors duration-200 hover:bg-white/10 hover:text-white sm:block"
            >
              Team sign in
            </Link>
            <Link
              href="/book"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink-950 shadow-lift transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:shadow-glow active:scale-[0.98]"
            >
              Book a shoot
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      {/* ─── Hero ────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-12 sm:pt-16">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div className="stagger">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ocean-400">
              Oceano Blue Media
            </p>
            <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
              Every shoot,
              <br />
              one&nbsp;current.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-200">
              The platform that runs our studio — booking, scheduling, photo and video
              production, podcasts, and delivery move through a single pipeline, so nothing
              stalls and nothing gets lost.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 rounded-lg bg-ocean-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lift transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:bg-ocean-400 hover:shadow-glow active:scale-[0.98]"
              >
                Book a shoot
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40 active:scale-[0.98]"
              >
                Team sign in
              </Link>
            </div>
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500">
              Serving the Lowcountry · Bluffton — Hilton Head — Beaufort — Savannah — Charleston
            </p>
          </div>

          {/* Product mock — the command center, built from the real design system */}
          <div className="relative hidden md:block" aria-hidden>
            <div
              className="absolute -inset-10 rounded-[3rem]"
              style={{
                background:
                  'radial-gradient(ellipse at center, rgba(12,141,233,0.14), transparent 70%)',
              }}
            />
            <div className="relative rounded-2xl bg-ink-900/90 shadow-2xl ring-1 ring-white/10">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  Command center · Today
                </span>
              </div>

              <div className="space-y-3 p-5">
                <MockJob
                  address="21 Palmetto Bluff Rd · Bluffton"
                  status="AI production"
                  tone="ocean"
                  progress={64}
                />
                <MockJob
                  address="48 Calhoun St · Charleston"
                  status="Client review"
                  tone="amber"
                />
                <MockJob
                  address="Sea Pines Villa · Hilton Head"
                  status="Approved for delivery"
                  tone="green"
                />

                {/* Photo strip */}
                <div className="grid grid-cols-5 gap-2 pt-2">
                  {[
                    'from-sky-800 via-ocean-600 to-sky-300',
                    'from-amber-900 via-orange-700 to-amber-300',
                    'from-ink-700 via-ocean-800 to-ocean-500',
                    'from-teal-900 via-teal-600 to-sky-200',
                    'from-ink-600 via-slate-500 to-slate-200',
                  ].map((g, i) => (
                    <div
                      key={i}
                      className={`relative aspect-[4/3] rounded-md bg-gradient-to-br ${g} ring-1 ring-white/10`}
                    >
                      {i === 2 && (
                        <span className="absolute bottom-1 right-1 rounded bg-ink-950/80 px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-ocean-300">
                          Enhanced
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pipeline rail ───────────────────────────────────── */}
      <section className="relative z-10 border-t border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ocean-400">
            The pipeline
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            From booked to delivered, without the busywork.
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <Stage
              icon={<CalendarClock className="h-5 w-5" />}
              n="01"
              title="Booked"
              body="Clients pick a package and a time — the calendar and the job open themselves."
            />
            <Stage
              icon={<Camera className="h-5 w-5" />}
              n="02"
              title="Shot"
              body="Capture checklists per shoot profile keep every bracket and angle accounted for."
            />
            <Stage
              icon={<Wand2 className="h-5 w-5" />}
              n="03"
              title="Produced"
              body="HDR merge, signature enhancement, sky and window work — with QC on every frame."
            />
            <Stage
              icon={<Eye className="h-5 w-5" />}
              n="04"
              title="Reviewed"
              body="Internal review, then client review — approvals and revisions tracked in one place."
            />
            <Stage
              icon={<Send className="h-5 w-5" />}
              n="05"
              title="Delivered"
              body="Branded galleries with web and full-size downloads, ready the moment they're approved."
            />
          </div>
        </div>
      </section>

      {/* ─── Capabilities ────────────────────────────────────── */}
      <section className="relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-5 md:grid-cols-3">
            <Capability
              icon={<Images className="h-5 w-5" />}
              title="Real estate media"
              body="Photo, video, and drone coverage that moves listings — processed and delivered on a schedule agents can plan around."
            />
            <Capability
              icon={<Mic className="h-5 w-5" />}
              title="Podcasts & shows"
              body="Per-client podcast production and publishing — recording through edit through release, run as a pipeline, not a scramble."
            />
            <Capability
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Protected delivery"
              body="Token-protected client galleries with expiration control, view tracking, and full-resolution downloads."
            />
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
          <div>
            <BrandLogo variant="white" className="h-6 w-auto" />
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500">
              Internal platform · Clients book a shoot above
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm text-ink-300">
            <Link href="/book" className="transition-colors hover:text-white">
              Book a shoot
            </Link>
            <Link href="/portal" className="transition-colors hover:text-white">
              Client portal
            </Link>
            <Link href="/login" className="transition-colors hover:text-white">
              Team sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────── */

const STATUS_TONES = {
  ocean: 'bg-ocean-500/15 text-ocean-300 ring-ocean-400/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
} as const;

function MockJob({
  address,
  status,
  tone,
  progress,
}: {
  address: string;
  status: string;
  tone: keyof typeof STATUS_TONES;
  progress?: number;
}) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-ink-100">{address}</span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ring-1 ${STATUS_TONES[tone]}`}
        >
          {status}
        </span>
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ocean-500 to-ocean-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Stage({
  icon,
  n,
  title,
  body,
}: {
  icon: React.ReactNode;
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-500/10 text-ocean-300 ring-1 ring-ocean-400/25 transition-all duration-300 ease-swift group-hover:bg-ocean-500/20 group-hover:ring-ocean-400/50">
          {icon}
        </span>
        <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-ink-500">{n}</span>
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
    </div>
  );
}

function Capability({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-xl bg-white/[0.04] p-7 ring-1 ring-white/10 transition-all duration-300 ease-swift hover:-translate-y-1 hover:bg-white/[0.07] hover:ring-ocean-400/40">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-500/10 text-ocean-300 ring-1 ring-ocean-400/25">
        {icon}
      </span>
      <h3 className="mt-5 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
    </div>
  );
}
