# Operations reliability and recovery

Public bookings are validated against current services, working hours, notice limits, internal conflicts, blocks, and connected Google calendars before they are committed. Database checks and the existing photographer advisory lock guard against concurrent conflicting bookings. Google can still change independently after a check; there is no transaction spanning Google and PostgreSQL.

## Booking follow-ups

`commit_public_booking` atomically creates the booking, idempotency record, and separate calendar, client-email, office-email, and office-SMS tasks. `/api/cron/booking-followups` processes up to three tasks every minute, using the existing `CRON_SECRET` bearer credential. Normal confirmations may take a minute or two. No provider call is required to save the booking.

Claims have a five-minute lease. Email and calendar failures retry up to six times with increasing delays. Email retries use a stable Resend key and stop for review before its 24-hour deduplication window expires. Google inserts use deterministic IDs for booking follow-ups. An uncertain or failed SMS requires review because automatic replay could duplicate a text.

The dashboard attention queue shows delayed follow-ups, failed photo jobs, jobs that have not changed for 24 hours, and calendar connections requiring consent. Stale does not imply abandoned: review the job, source assets, and worker status before retrying or changing its status. Existing jobs are not automatically reset by these migrations.

For a failed calendar task, restore Google access first and use the order's calendar sync or Settings → Integrations backfill. For email/SMS review, compare the order, recipient, provider delivery record, and task ID before manually resending. Do not blindly reset every task. A provider timeout can occur after it accepted a message.

## Calendar connections

Settings → Integrations includes a Reconnect action. The owner must approve `calendar.readonly` alongside event access so availability can enumerate calendars and read free/busy. An existing connection with missing permissions, revoked access, or a provider error is unavailable for public scheduling. A photographer who has never connected still uses internal working hours and blocks, preserving guest-invite workflows; external personal events are not verified for those photographers.

Temporary token refresh failures leave the connection active and surface an error. Only a revoked/invalid refresh grant marks it inactive. Do not rotate unrelated API keys to resolve Google consent.

Google virtual subscription calendars ending in `@group.v.calendar.google.com` may return `notFound` from FreeBusy even when calendar enumeration succeeds. Only that unsupported-subscription response is skipped; standard personal/shared calendar errors and other subscription failures remain blocking. Preview validation exposed this case, and regression tests preserve busy ranges from the working calendars.

## Payment confirmations

The Stripe destination at `/api/stripe/webhook` must subscribe to both `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Completion alone can mean a delayed payment is still pending. Downloads unlock only for a payment-mode session whose payment status is `paid` or `no_payment_required` (a fully discounted checkout).

The handler verifies Stripe's signature against the raw request body and stamps an order only if it is not already paid. A database write error returns HTTP 500 so Stripe can retry; check `stripe.paymentPersistence` logs and Stripe event deliveries if a settled payment leaves downloads locked. Do not mark an order paid merely because the customer reached the checkout success page.

## Release validation and rollback

The release upgrades Next 14 through Next 15 to Next 16, React 19, current patched Sharp, and patched test/database tooling. Server request cookies and route parameters use the asynchronous APIs. Node 24 is configured in CI to match Vercel. Tests, TypeScript, build, lint errors, and high/critical dependency advisories are blocking CI steps. Compiler-adoption lint rules remain disabled pending a separate React Compiler migration; existing lint warnings are not build failures.

The new SQL objects are additive. The pricing and booking helper grants are restricted to the server role, and unverified public contact input no longer overwrites existing client profiles. Team members may update ordinary profile details, but only an active admin may change identity, role, or activation. The assignment report retains staff/service access and denies nonstaff access.

If a frontend release regresses, redeploy the previous known-good Vercel deployment. Keep the security restrictions and new database tables in place: the previous server booking routes retain service-role execution. Database schema/security changes are not undone by a Vercel rollback. Pending follow-ups require a working cron runner; recover or deploy its route before declaring them delivered. Do not delete idempotency records during recovery.

A successful build or public-page check does not prove authenticated uploads, payments, email delivery, or worker rendering. Use their real operational evidence separately; never create customer-facing test notifications without an agreed test recipient.
