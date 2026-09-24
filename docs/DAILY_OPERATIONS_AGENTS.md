# Daily operations and assistants

`/dashboard` is now **My Day**. The previous home dashboard is preserved at
`/dashboard/overview`; the existing Command Center is unchanged.

## What is implemented

- A live operations queue combining orders, linked production jobs, internal
  editor assignments, and outsourced editing batches. Linked records are deduplicated.
- Today's primary Google Calendar and scheduled shoots, with overlapping events,
  dated priorities, overdue work, missing deadlines and failed-tool warnings.
- An editorial morning brief inspired by the supplied reference, with calendar commitments, a numbered inbox list, and action buttons.
- Editable editor handoffs and follow-ups, AI-assisted email replies, and optional Gmail draft saving. Queue cards open the correct editing, review or delivery step.
- Read-only Gmail is separately opt-in and disabled until security setup is complete.
- Three configurable assistants: day planner, editor handoffs, delivery monitor.
  Each can use built-in factual rules, OpenAI Responses, or Anthropic Messages.
- Available model IDs are retrieved from the configured provider account and
  checked before saving. Provider credentials remain server-only.
- Personal daily schedules, a manual refresh, stored outputs, token usage, and
  a seven-run history. No mock records or unauthenticated preview route are added.
- Default schedule: every day at 07:00 America/New_York, including weekends.
  Defaults use free factual rules and therefore make no paid model calls.

## Activate in the existing deployment

1. Review this branch and the additive migration
   `20260924110921_daily_operations_agents.sql`. Apply it to the intended database
   using the existing `DB_MIGRATIONS_RUNBOOK.md` procedure, including its dry run
   and exact project-reference confirmation. Existing office users receive free
   daily settings; new staff can initialize theirs with Save assistant settings.
2. Verify server-only `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in Vercel.
   The application already uses both patterns for other scheduled work.
3. Optional: add `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`. OpenAI's existing
   image-processing key can also supply text models if that project permits them.
   ChatGPT/Claude chat plans are separate from API billing; this feature does not
   import chat history or reuse browser session credentials.
4. Deploy the reviewed branch to production. Vercel preview deployments do **not**
   execute cron jobs. The cron endpoint runs every 15 minutes and checks each
   user's local clock, so DST changes do not move their morning schedule.
5. Sign in as office staff, connect Google Calendar in Settings → Integrations,
   select provider/model choices in My Day, save, then Refresh brief. Review the
   saved run and confirm a scheduled `daily` run on the following local day.

The migration and secrets must be applied before calling the daily system live.
Without the migration the page can still show live production facts, but clearly
marks settings/history setup as required. The operations migration was applied and verified on 2026-09-24. The standalone
Google token permission hotfix was also applied to the live Ops database.
Gmail activation remains separately gated; deployment does not enable it.

## Execution and safety

- A database unique key `(user_id, local_date, run_key)` atomically claims runs.
  Concurrent cron invocations cannot issue duplicate calls for the same daily run.
- Manual runs have independent 15-minute slots. Repeated clicks return the existing
  result; changing models does not bypass the current slot. At most three model
  requests are issued per run, each with a 2,500 output-token limit and 35s timeout.
- Interrupted runs are marked failed after 10 minutes. Paid calls are not retried
  silently; staff can explicitly refresh in the next manual slot. Provider failures
  return a factual fallback and leave a visible error in history.
- Up to three pending users run concurrently per cron invocation. Additional users
  wait for the next 15-minute tick; claimed users are excluded before batching.
- Calendar failure is explicit. It never becomes a claim that the calendar is free.
  All-day dates remain date-only. Calendar pagination is bounded and fails visibly
  rather than pretending partial coverage is complete.
- Only active office staff can use APIs. Calendar connections are selected by the
  authenticated user, never an incoming user ID. Snapshots/history have owner-only
  staff RLS; only the server runner can write execution records.
- Calendar titles and production text are untrusted model input. Providers have
  no tools. They can draft and recommend but cannot send messages, move bookings,
  assign work, release deliveries, or make purchases.

## Current limits

- Calendar coverage is the connected primary Google Calendar. Secondary calendars,
  Outlook, Apple Calendar, full-mailbox triage, automatic editor messaging, and automatic
  client delivery are not implemented by this change.
- Missing production deadlines stay unknown. No turnaround/SLA is fabricated for
  orders without a linked job or assignment deadline.
- Media access, recipient, creative brief and return location still need human
  confirmation before a handoff. Existing editing/delivery workspaces remain the
  authority for those actions.
- Live queues are bounded to 500 active orders, 500 active jobs, and 1,000 current
  assignment/batch records each, with a visible truncation warning. Model input
  includes the first 100 prioritized items and 80 calendar events and reports omitted
  counts. The factual briefing lists the first 12 matching items.
- Gmail reads at most 20 recent inbox previews from the last 14 days, excluding promotions and social categories. It does not read full bodies or attachments. Unread does not mean unanswered.
- Email previews go only to the configured day planner, never the handoff/delivery assistants. Reply generation uses that same model and one source preview.
- Saved snapshots omit raw inbox previews and calendar events. Generated summaries may contain derived details; scheduled cleanup deletes briefing runs older than seven days from the active table. Backups and AI-provider retention are separate.
- Optional Gmail saving creates or updates a draft, never sends. Sending happens explicitly in Gmail; this does not automatically change job assignment/status. Fotello remains its existing manual upload flow.
- Draft actions are authenticated, staff-only, same-origin, and limited to 30 requests per user/hour with a durable fail-closed limiter.
- Live cards refresh on page refresh. A saved brief shows its generation timestamp;
  it is not silently regenerated on page loads. AI outputs are reviewed drafts.
- No dollar estimate is guessed from token counts. Set spending limits in each API
  provider account. History records actual returned input/output tokens.

## Validation

- Production Next.js build and TypeScript check.
- Full existing Vitest suite plus new operations tests.
- PostgreSQL-compatible PGlite tests execute the migration and verify private
  snapshots, staff-only settings, write restrictions and unique run claims.
- Provider adapter tests cover account model listing, selected model IDs, OpenAI
  storage opt-out, incomplete Anthropic output, and provider errors.
- Scheduling tests cover Eastern date boundaries and both DST transitions.

Official integration references:
- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/reference/resources/models
- https://platform.claude.com/docs/en/api/messages/create
- https://platform.claude.com/docs/en/api/models/list
- https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Google security rollout

See `GOOGLE_INTEGRATION_SECURITY.md` for the verified permission hotfix, threat
model, encryption deployment steps, and remaining production gates. Gmail is OFF
by default. Do not enable it solely because the feature builds successfully.

Gmail draft saving needs the broad `gmail.compose` scope, which also authorizes
sending at Google even though this application never calls the send endpoint.
Read-only users can prepare and copy drafts without granting that permission.

Official Gmail references:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/guides/drafts
