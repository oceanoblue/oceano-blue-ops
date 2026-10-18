# Inquiry inbox

The office queue at `/dashboard/crm/inquiries` tracks whether a person has answered an inquiry. It is separate from automatic acknowledgments, workflow emails and booking reminders.

New Ops contact-form submissions enroll once per project after the database migration is installed. Existing submissions and imported HoneyBook projects are not enrolled automatically. An office user may explicitly enroll an open project by recording the original message, source, received timestamp and reason. This does not send a client email. Preserve unknown timing as an office review note; do not invent the source receipt time.

An inquiry becomes due 24 hours after receipt. Office email reminders occur at that point and a second time at least 48 hours after the first reminder was accepted (earliest 72 hours after receipt). Delayed workers cannot send both reminders together. The queue remains visible after these two reminders. Snooze re-arms a separate reminder cycle at the selected wake time, without invalidating an already queued reviewed client reply. Staff may record a response sent by email, phone, meeting or another channel, dismiss an inquiry with a reason, or explicitly reopen it. Changes use optimistic versions and append-only history.

A custom reply is queued only when an office user reviews the subject/body and explicitly chooses Queue reply. This uses the existing acquisition outbox and its provider idempotency, leases and review semantics. Reuse the same request UUID after an uncertain HTTP result; a second active or ambiguous reply is blocked. A blocked old reply is cancelled before a new reviewed reply is queued; preflight checks the exact current reply pointer. Acknowledgments and automated follow-ups have no reply link and never count as a human response. Only provider acceptance of this reviewed reply marks it answered; provider acceptance does not prove inbox delivery. An uncertain send remains unanswered and needs provider review.

Booked/closed/archived projects and archived contacts leave the active unanswered queue. Reply preflight checks these states and a changed recipient again. A dismissed or answered inquiry cancels unattempted replies and alerts. A send already accepted or in flight can still arrive after an office action; its outcome remains in the audit history. Calendar availability, pricing and booking status are never inferred from the inbox.

## Deployment configuration

The existing `/api/cron/crm-acquisition` invokes both workers. It requires `CRON_SECRET`, runs production only and uses the existing Resend configuration.

- `CRM_INQUIRY_ALERTS_ENABLED=1` and an explicit valid `CRM_INQUIRY_ALERT_TO` enable office reminders. This recipient is server configuration, never an inquiry contact or browser request.
- `RESEND_API_KEY`/`EMAIL_FROM`/`EMAIL_REPLY_TO` use the existing mail setup. Without provider configuration the in-app queue still works.
- `OPENAI_API_KEY` and explicit `CRM_INQUIRY_AI_MODEL` enable on-demand AI drafting. Configuring the model authorizes sending the bounded inquiry context to the configured OpenAI account; obtain the owner's approval first. No model is selected automatically. With missing/failed AI configuration, the application supplies a tailored company template and labels it as a template.

AI drafts receive a bounded source message and relevant labeled form answers (contact email/phone/name fields excluded). Total serialized context is capped at 16,000 characters; each extra answer is capped at 800. Existing `generateText` uses the Responses API with `store:false`. Input is untrusted data. Drafts cannot call tools, send email, inspect a calendar, create a booking or quote prices. A conservative output guard falls back to company copy for numbers, prices, availability or booking commitments. The reviewer must personalize and verify the draft. Generation alone creates no email job.

GET `/api/crm/inquiries` supports `q`, `status` and zero-based `page`; results have server pagination, global counts, original labeled answers and office notification health. `projects_only=1&q=...` searches up to 50 active open project IDs for explicit enrollment. All routes require active admin/coordinator access; mutations require same-origin JSON, bounded payloads and production. Tables have office-only read RLS, no browser writes and service-only guarded RPCs.

Apply `20261018183631_crm_inquiry_inbox.sql` before deploying code. No historical backfill or client send is part of the migration. `blocked` and `needs_review` office notification outcomes are visible in the inbox health summary; they are not automatically replayed. Inspect the provider and recorded notification ID before any manual repair.

This is inquiry response tracking, not inbox synchronization. Incoming email replies, HoneyBook inbox activity, delivery/bounce events, SMS and historical conversation imports require separate custody/integration work. Explicitly enroll any source inquiry that still needs attention; changing the website form is a separate cutover.
