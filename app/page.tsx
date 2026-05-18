import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 to-white">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-ocean-700">Oceano Blue</p>
        <h1 className="mt-2 text-4xl font-bold text-ocean-950 sm:text-5xl">
          Real estate photography, end to end.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-700">
          Book a shoot, schedule, shoot, process with AI, and deliver — all in one workflow built
          for the Oceano Blue team.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/book" className="btn-primary">Book a shoot</Link>
          <Link href="/login" className="btn-secondary">Team sign in</Link>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Feature title="Booking + scheduling" body="Agents request shoots, the team accepts, and the calendar updates instantly." />
          <Feature title="AI photo processing" body="HDR merge, sky replacement, window pulls, and more — powered by GPT Image and Banana Pro." />
          <Feature title="Branded delivery" body="Token-protected galleries with full-size downloads, view tracking, and expirations." />
        </div>
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
