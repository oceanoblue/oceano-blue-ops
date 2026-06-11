import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 to-white">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-ocean-700">Oceano Blue Media</p>
        <h1 className="mt-2 text-4xl font-bold text-ocean-950 sm:text-5xl">
          The Production OS.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-700">
          One platform to run the whole studio — bookings and scheduling, AI photo and video
          production, podcasts, client delivery, and the automations that tie it all together.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/login" className="btn-primary">Team sign in</Link>
          <Link href="/book" className="btn-secondary">Book a shoot</Link>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Feature
            title="Production pipeline"
            body="Listings, orders, and jobs move from booking → shoot → AI production → review → delivery, with live progress at every step."
          />
          <Feature
            title="AI media processing"
            body="HDR merge, signature enhance, sky replacement, and window pulls — GPT Image 2.0 with Nano Banana as a secondary engine."
          />
          <Feature
            title="Podcasts & delivery"
            body="Per-client podcast production and publishing, plus token-protected client galleries with web and full-size downloads."
          />
        </div>

        <p className="mt-16 text-xs text-slate-400">
          Internal platform for the Oceano Blue Media team. Clients book a shoot above.
        </p>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold text-ocean-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
