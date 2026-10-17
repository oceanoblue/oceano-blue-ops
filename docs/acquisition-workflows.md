# Website inquiries, replies, follow-ups and client files

The acquisition workspace is `/dashboard/crm/acquisition`. CRM's header, Automations section, related links and individual contact workspaces link to it.

## Configure before replacing the website embed

1. In **Reply templates**, review the acknowledgment, personalize the wording, and mark it ready. The sender and office reply address are shown in Ops. Existing Resend configuration is reused; configuration presence alone does not verify inbox delivery.
2. In **Smart files**, create or review a brochure, project brief or questionnaire. The builder supports ordered text sections, secure HTTPS document links and validated questions. Preview the client view and mark the template ready. Quote and invoice links can point to existing Ops pages; these files do not yet create native invoices, payment schedules, service-selection proposals or client e-signatures.
3. In **Workflows**, select the website form. Email steps can require office approval or send automatically. A file template can accompany each email. Delays are relative to the inquiry, in hours or Monday–Friday business days, using the workflow timezone. Holidays are not separately configured. Task steps create office tasks immediately with the configured future due date.
4. Enable the workflow for future inquiries. The starter is disabled, its email requires approval, and all starter templates are drafts. No existing inquiry, contact or archived HoneyBook project is enrolled.
5. In **CRM → Contact forms**, review and publish the form. Verify one isolated inquiry using an office-owned test address, review its outbox entry and actual inbox delivery, open the client file and submit its questionnaire. Then copy the iframe code to the website. The website placement has not been changed by this implementation.

The starter has an immediate acknowledgment draft and an office follow-up task due two business days later. Uncheck **Office approval required before sending** when the approved acknowledgment should send automatically. The production cron dispatches scheduled emails every minute.

## Delivery and stopping rules

- **Outbox** shows approval holds, scheduled/accepted messages and failures. Provider acceptance is distinct from inbox delivery. Delivery/bounce webhooks and mailbox synchronization are not implemented here.
- Replies go to the configured office Reply-To address (default `info@oceanoblue.net`). Staff use **Client replied / stop follow-ups** to stop pending messages for that project. This does not claim automatic detection of an email reply.
- A submitted smart-file response automatically stops remaining queued messages for the project. The response is available in the issued-file viewer and the event appears in the contact's CRM activity.
- Leaving an open pipeline stage, archiving the contact/project, disabling the workflow, or returning an in-use template to draft cancels queued workflow messages. Archiving still pauses open project tasks under the existing archive policy. Reopening or re-enabling does not restart cancelled runs.
- An email already handed to the provider cannot be recalled. The preflight rechecks project/contact/workflow state immediately before starting a provider call.
- Explicitly issuing a new file after an office reply hold is allowed for an open project; it does not resume the old automated sequence.

## Client files and evidence

Each issue stores an immutable template snapshot and project context. Later edits do not change already issued copies. Private bearer links use two random UUIDs, expire 30 days after their planned send (or after manual issuance), suppress referrers and indexing, and can be permanently revoked while retaining history. They give access only to that issued document. They do not establish a verified signing identity.

Questionnaire responses are validated on the server and committed atomically under a row lock. Duplicate retries return the existing result; a different second response cannot overwrite the original. Responses and issued content are immutable. Page-view activity is labelled as a page view, not proof of a human reading the file.

## Reliability and access

Seven new tables use office-only RLS and guarded, service-only RPCs. Active admins and coordinators may configure workflows; clients and contractors cannot access the office API. Public client-file APIs require the private token, same-origin JSON requests, bounded bodies and durable rate limiting.

The worker claims bounded batches with `FOR UPDATE SKIP LOCKED`, uses a per-job lease, freezes email content, and persists provider outcomes. A stale lease that never began sending can be reclaimed. An interrupted or failed provider attempt requires review and is not automatically replayed. A blocked email with no send attempt can be retried after configuration is repaired. Resend requests also carry a stable job-specific idempotency key ([provider documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)).

All acquisition mutations and mail dispatch are disabled on preview/local deployments so a preview sharing production's database cannot activate a workflow or queue client mail. Configuration and document preview remain readable. No new Gmail permission, third-party connection or client email is needed to deploy the disabled starters.

Lists are bounded to 100 records. Open-project search is a separate lightweight request and respects the contact scope. Full outbox/template pagination, automatic inbound reply association, webhook delivery events, native client signing/payments and general branching workflows remain future work.

## Release verification

Migration `20261017042746_crm_acquisition_workflows.sql` was applied to the Ops Supabase project. Remote checks confirmed RLS on all seven tables, no anonymous file reads or worker RPC execution, zero enabled workflows/ready templates/jobs/issued files, and zero published forms. The business-day/DST result was verified against the remote database. The security advisor returned the same four pre-existing findings and no CRM findings.

The full suite passes 934 tests across 122 files. Coverage includes atomic enrollment, duplicate public retries, task deadlines across DST/weekends, immutable email/file snapshots and responses, lease claims, approval holds, archive/response/disable stop behavior, safe unsent retry, provider ambiguity, auth/CSRF/rate limits and preview isolation. TypeScript, production build and lint pass (10 pre-existing warnings, no errors). Desktop and 390px mobile views were checked; the temporary visual fixtures are excluded from the release. No client email was sent during verification.
