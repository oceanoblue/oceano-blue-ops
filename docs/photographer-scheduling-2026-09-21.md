# Photographer scheduling

Online booking offers a time when at least one eligible photographer is free. Eligibility includes working hours, time off, connected Google calendars, existing orders, requested services, service ZIP codes, and travel buffers. Lower priority numbers receive offers first. Initial settings offer standard Interior/Exterior Photography to Karen first; Gustavo covers other services and provides backup. Karen must connect Google herself to include personal-calendar conflicts. An unconnected calendar uses app bookings and configured hours; a connected calendar that cannot be verified is excluded.

New contractor bookings reserve the time and queue email/SMS acceptance requests with a 60-minute response window. Client confirmation follows acceptance. A decline or timeout checks fresh availability before offering the same time to the next qualified photographer. If nobody can cover it, the office receives an alert and the job appears in Needs attention. The minute cron processes delivery and rerouting; provider delays can add latency. Gustavo assignments confirm directly. Office-selected assignments remain office-owned and escalate on expiry without automatic reassignment.

Schedule includes photographer lanes, day/week views, person filters, listing/client/service information, acceptance badges, time off, calendar busy ranges, and an all-dates attention queue. Hours & routing allows administrators to set priority, qualifications, ZIP coverage, travel gaps, and colors; staff can edit their own hours and time off. Photographers use /field/availability; only their own hours, time off, and calendar endpoints are permitted through the office access guard. Weekly-hour replacements are atomic. ZIP buffers (30-minute base, 45-minute different ZIP initially) are allowances, not live driving-time estimates. Adding time off does not cancel or reassign existing shoots.

Assignment versions invalidate prior response links when a time or photographer changes. Rescheduling requires another contractor acceptance; both the client page and email call this a reservation. Google RSVP mirroring checks the assignment version. Legacy unversioned portal requests can only update untouched legacy assignments. OAuth calendar connection now binds its callback to the same authenticated account and a short-lived HttpOnly state cookie.

## Rollout and validation

- Migration starts with `scheduling_dispatch_enabled=false`; activate only after the new application is ready.
- Backfill only missing photographer IDs from linked contractors. Existing assignments, responses, prices, and appointments remain unchanged; no retrospective acceptance messages are queued.
- Unit/integration coverage includes pooled capacity in both directions, priorities, service qualifications, fail-closed calendar errors, ZIP buffers, database overlap guards, pending/confirmed transitions, decline/expiry fallback, stale workers and links, rescheduling, outbox suppression, permissions, and transactional hour replacement.
- 461 tests passed. TypeScript passed. Lint passed with ten pre-existing warnings. Production build passed with Webpack; local Turbopack cannot bind its internal port in the sandbox. Hosted CI validates the standard build.
- Production checks use read-only data and browser navigation. No test booking or live notification is sent.
