# CRM transition release — October 17, 2026

The CRM now connects relationships, client emails/files, reusable session links,
project installment payments and a source-evidence review queue. Office access is
required throughout; public links expose only their own booking/document/payment.

## Live configuration and source custody

The release audit covers 80 projects dated in 2026 (79 unarchived and one archived),
the three visible projects dated in 2027, future appointments attached to older
projects, and the connected business calendars. Source observations retain dates,
reported balances, follow-up owners and reasons for review. They are not proof
that an old balance is collectible or that a future inquiry is booked.

Confirmed future work remains active. Historical work follows the requested
archive-on-import policy. Unaccepted future proposals retain an open stage.
Reference appointments reserve internal availability, preserve source identity,
and create attendance tasks without duplicating source reminders or Google events.
They remain managed in HoneyBook until an explicit scheduling cutover.

Imported financial facts and prior paid credits are immutable. Remaining source
installments default to held. Staff must reconcile external receipts, verify due
dates and stop source collection before activating an Ops payment link. Unresolved
source balance observations are displayed separately from the actual invoice
ledger. Zero-dollar proposal placeholders do not become receivables. Stripe review
resolution rechecks live provider evidence and never initiates a refund or charge.

Session configurations are published only after comparing source availability,
duration, buffers and notice. The replacement supports exact calendar-month
horizons, start increments, phone requirements and preservation of office project
dates. Expired source configurations and unsupported SMS dependencies stay under
review. Ops notifications currently use email, with 24-hour and one-hour reminders.
Publishing a new Ops URL does not redirect a previously shared HoneyBook URL.

## Verification and operation

The final automated checks passed 1,093 tests across 137 files, TypeScript and
ESLint (ten existing warnings). A production webpack build passed locally; GitHub
CI also runs the default Turbopack build. New service RPCs use active office actor
guards, private tables use RLS, and public commands use durable fail-closed limits.
The existing database advisor warnings remain outside this release; service-only
financial tables intentionally have deny-by-default RLS without browser policies.

The scheduling notification cron runs each minute. Native booking uses a private
Google busy hold without attendee invitations; retries use deterministic event
identity. Calendar/provider failures remain visible and availability fails closed.
Provider mail acceptance is distinct from verified delivery to an inbox.

## Remaining HoneyBook retirement work

This release does not establish complete HoneyBook feature parity. Existing signed
contracts, original smart files and attachments, full message history, automatic
inbound reply association, SMS reminders, native client contract signing and
recurring/autopay mandates require additional migration or implementation. A
questionnaire is not an electronic signature and an imported balance is not a
transferred payment authorization. Update website embeds and shared scheduling
destinations, reconcile money, and verify the remaining source custody before
retiring the subscription.
