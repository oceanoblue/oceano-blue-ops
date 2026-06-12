import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="grain relative min-h-screen overflow-hidden bg-ink-950 text-white">
      {/* Ambient ocean glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl animate-float-slow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(12,141,233,0.55), rgba(12,141,233,0.12) 55%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-24 sm:py-28">
        <div className="stagger">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-ocean-400">
            Oceano Blue Media
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.04] tracking-tight sm:text-7xl">
            The Production&nbsp;OS.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-200">
            One platform to run the whole studio — bookings and scheduling, AI photo and video
            production, podcasts, client delivery, and the automations that tie it all together.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-ink-950 shadow-lift transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:shadow-glow active:scale-[0.98]"
            >
              Team sign in
            </Link>
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 transition-all duration-200 ease-swift hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40 active:scale-[0.98]"
            >
              Book a shoot →
            </Link>
          </div>
        </div>

        <div className="stagger mt-24 grid gap-5 md:grid-cols-3">
          <Feature
            n="01"
            title="Production pipeline"
            body="Listings, orders, and jobs move from booking → shoot → AI production → review → delivery, with live progress at every step."
          />
          <Feature
            n="02"
            title="AI media processing"
            body="HDR merge, signature enhance, sky replacement, and window pulls — GPT Image 2.0 with Nano Banana as a secondary engine."
          />
          <Feature
            n="03"
            title="Podcasts & delivery"
            body="Per-client podcast production and publishing, plus token-protected client galleries with web and full-size downloads."
          />
        </div>

        <p className="mt-20 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500">
          Internal platform · Clients book a shoot above
        </p>
      </div>
    </div>
  );
}

function Feature({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="group rounded-xl bg-white/[0.04] p-6 ring-1 ring-white/10 transition-all duration-300 ease-swift hover:-translate-y-1 hover:bg-white/[0.07] hover:ring-ocean-400/40">
      <div className="font-mono text-[11px] font-bold tracking-[0.2em] text-ocean-400">{n}</div>
      <h3 className="mt-3 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
    </div>
  );
}
