import { PortalHero } from '@/components/portal/PortalHero';

/** Signed in, but this login isn't linked to any client account. */
export function NotAClient() {
  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHero title="Account not linked yet">
        <form action="/api/portal/signout" method="POST">
          <button className="text-sm text-ink-300 transition hover:text-white">Sign out</button>
        </form>
      </PortalHero>
      <main className="mx-auto max-w-xl px-6 py-12">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-600">
            We couldn&rsquo;t match this sign-in to a client account. If you&rsquo;ve booked with
            us before, sign in with the email you booked with — otherwise contact us so we can
            finish setting up your portal.
          </p>
        </div>
      </main>
    </div>
  );
}
