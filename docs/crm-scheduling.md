# Client session scheduling

Ops scheduling is separate from the existing property booking checkout. The
office workspace is `/dashboard/crm/scheduling`; a published reusable link is
`/meet/<slug>`. Sessions support 15–720 minutes, multiple weekly windows,
IANA timezones, 0–30 days minimum notice, separate before/after buffers and a 1–365 day
booking horizon or an exact 1–12 calendar-month rolling horizon. Start-time
increments are configurable per link. The public page shows the visitor's timezone while identifying
the host's calendar date timezone. A configuration can remain a draft.

## Booking and conflicts

Publishing and each reservation require the host's own active Google connection
with event write permission. Availability combines live Google events, existing
property shoots (including crew offsets), schedule blocks and native session
holds. Calendar errors close availability. SQL repeats notice, hours and internal
conflict checks under the same owner advisory lock used by property checkout.
The appointment atomically reserves a `schedule_blocks` row, including its buffer,
so property bookings also see it. Two session links cannot reserve the same host.

Sessions also preserve the organization's existing shoot travel buffer around
each assigned crew visit. This travel time is additional to the session's own
before/after buffer, in either booking direction; CRM-to-CRM holds keep only
their configured session buffers. Staff shoot rescheduling respects CRM holds
and retains the existing explicit overlap override. Updates that leave the crew
and schedule unchanged can still complete delivery and payment work. This does
not add route-specific travel estimates to CRM scheduling.

Each new booking reuses a matching email contact and creates an inquiry project,
an assigned attendance task and an immutable CRM event. Phone sessions require
a callable phone number. Links can use the session as the new project's date;
consultations can keep their actual project date separate. A later office date
override is preserved when a client reschedules. Existing contacts are
not overwritten from a public form. A booking request UUID and canonical payload
hash make retries idempotent. Private, random 256-bit management tokens allow
cancellation, rescheduling and an `.ics` download. Native client changes are
available until the original session starts. Changes use optimistic versions.
Preview deployments cannot save or book.

Native appointments create a private busy event on the host's primary Google
calendar. The event ID is deterministic, interrupted retries converge, and no
attendees or invitations are added. Rescheduling ignores only that appointment's
exact primary-calendar event ID; unrelated events remain conflicts. Google is an
external system, so another app can still introduce a conflict after a fresh
availability check. Native reservations are immediate in Ops; the Google hold is
processed through the durable outbox.

## Confirmation and reminders

The protected production worker is `GET /api/crm/scheduling/notifications`, using
the existing `CRON_SECRET` bearer key. Run it each minute through the deployment
cron. It processes bounded jobs with leases and a per-appointment claim, preventing
an earlier calendar update from overtaking a later one. Calendar failures and
uncertain email acceptance remain visible for office review.

Clients explicitly opt into session email. Opted-in clients receive confirmation,
change/cancellation notices and reminders 24 hours and one hour before. A reminder
whose time has already passed or falls within five minutes of a new booking is
not queued. The host receives office emails independently of client opt-in. This
is transactional session email, not marketing consent. SMS is not enabled.

The existing Resend infrastructure sends mail with stable idempotency keys.
Provider acceptance is recorded; it is not a verified inbox delivery. Ambiguous
delivery outcomes need provider review before another copy is sent. Source
imports never enroll in these messages.

## Source appointment audit

`crm_session_import(actor, appointment_id, data)` records verified HoneyBook or
Google commitments against an existing Ops client/project. Required data:

```json
{
  "source_system": "honeybook",
  "source_id": "verified-source-reference",
  "source_evidence": { "url": "verified source URL", "original_starts_at": "original timestamp" },
  "owner_id": "active office host UUID",
  "client_id": "existing client UUID",
  "project_id": "existing project UUID",
  "title": "Verified session title",
  "starts_at": "verified ISO timestamp with offset",
  "ends_at": "verified ISO timestamp with offset",
  "timezone": "America/New_York",
  "manage_token": "server-generated 64 lowercase hexadecimal characters"
}
```

Optional fields are `location`, `notes` and `status` (`confirmed` or `cancelled`).
The RPC deduplicates by source system/source ID, preserves immutable evidence,
creates a silent internal reservation and assigns a task for upcoming commitments.
Past/cancelled reference tasks are recorded as completed. Upcoming commitments
cannot be imported into an archived CRM project. A reference import remains
managed in its original system and cannot be changed through client self-service.
It never creates another Google event, invitation, client email or reminder.

Reference visibility does not establish ownership of the original booking link,
move a payment mandate or cancel the original appointment. Before changing an
existing client-facing scheduling link, verify its original settings and replace
the published destinations deliberately. The HoneyBook consultation configuration
was observed as 30 minutes, phone, America/New_York, weekdays 09:00–12:00 and
13:00–17:00, 30-minute before/after buffers, no minimum notice, client changes
enabled, and office/client 24-hour plus one-hour reminders. Only settings supported
by source evidence should be published for other session types.

## Access and validation

All new tables use RLS and office-only reads. Browser writes go through guarded
service RPCs that validate the active admin/coordinator actor. Public booking
uses server-only service access; no client or source ledger is exposed. Private
management responses omit email, phone, notes, source evidence and raw tokens.
Public mutation/PII routes use bounded JSON, same-origin checks and durable,
hashed-IP rate limits. Private responses use no-store/no-referrer/noindex headers.

Meaningful coverage includes DST transitions, buffers, full-day sessions,
notice/horizon, internal conflicts, source import dedupe, source immutability,
office authorization/RLS, service-role execution, preview isolation, calendar
provider idempotency, exact month boundaries, per-link increments, phone call
requirements, project-date overrides, notification consent, host reminders and
stale/uncertain delivery handling.
