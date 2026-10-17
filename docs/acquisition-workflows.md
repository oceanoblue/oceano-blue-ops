# Website inquiries, replies, follow-ups and client files

The acquisition workspace is `/dashboard/crm/acquisition`. CRM's header, Automations section, related links and individual contact workspaces link to it.

## Configure before replacing the website embed

1. In **Reply templates**, review the acknowledgment, personalize the wording, and mark it ready. The sender and office reply address are shown in Ops. Existing Resend configuration is reused; configuration presence alone does not verify inbox delivery.
2. In **Smart files**, create or review a brochure, project brief or questionnaire. The builder supports ordered text sections, secure HTTPS document links and validated questions. Preview the client view and mark the template ready. Quote and invoice links can point to Ops payment pages. Smart-file blocks do not themselves create service-selection proposals, invoices or client e-signatures.
3. In **Workflows**, select the website form. Email steps can require office approval or send automatically. A file template can accompany each email. Delays are relative to the inquiry, in hours or Monday–Friday business days, using the workflow timezone. Holidays are not separately configured. Task steps create office tasks immediately with the configured future due date.
4. Enable the workflow for future inquiries. The starter is disabled, its email requires approval, and all starter templates are drafts. No existing inquiry, contact or archived HoneyBook project is enrolled.
5. In **CRM → Contact forms**, review and publish the form. Verify one isolated inquiry using an office-owned test address, review its outbox entry and actual inbox delivery, open the client file and submit its questionnaire. Then copy the iframe code to the website. The website placement has not been changed by this implementation.

The starter has an immediate acknowledgment draft and an office follow-up task due two business days later. Uncheck **Office approval required before sending** when the approved acknowledgment should send automatically. The production cron dispatches scheduled emails every minute.

## Delivery and stopping rules

- **Outbox** shows approval holds, scheduled/accepted messages and failures. Provider acceptance is distinct from inbox delivery. Delivery/bounce webhooks and mailbox synchronization are not implemented here.
- Replies go to the configured office Reply-To address (default `info@oceanoblue.net`). Staff use **Client replied / stop follow-ups** to stop pending messages for that project. This does not claim automatic detection of an email reply.
- A submitted smart-file response automatically stops remaining queued workflow messages for the project. The response is available in the issued-file viewer and the event appears in the contact's CRM activity.
- Inquiry workflows stop when a client is booked. Onboarding workflows run in booked stages only. Archiving or losing the project, archiving its contact, disabling the workflow, or returning an in-use template to draft cancels queued workflow messages. Archiving still pauses open project tasks under the existing archive policy. Reopening or re-enabling does not restart cancelled runs.
- An email already handed to the provider cannot be recalled. The preflight rechecks project/contact/workflow state immediately before starting a provider call.
- Explicitly issuing a new file after an office reply hold is allowed for an active (open or booked) project; it does not resume the old automated sequence.

## Client files and evidence

Each issue stores an immutable template snapshot and project context. Later edits do not change already issued copies. Private bearer links use two random UUIDs, expire 30 days after their planned send (or after manual issuance), suppress referrers and indexing, and can be permanently revoked while retaining history. They give access only to that issued document. They do not establish a verified signing identity.

Questionnaire responses are validated on the server and committed atomically under a row lock. Duplicate retries return the existing result; a different second response cannot overwrite the original. Responses and issued content are immutable. Page-view activity is labelled as a page view, not proof of a human reading the file.

## Reliability and access

Seven new tables use office-only RLS and guarded, service-only RPCs. Active admins and coordinators may configure workflows; clients and contractors cannot access the office API. Public client-file APIs require the private token, same-origin JSON requests, bounded bodies and durable rate limiting.

The worker claims bounded batches with `FOR UPDATE SKIP LOCKED`, uses a per-job lease, freezes email content, and persists provider outcomes. A stale lease that never began sending can be reclaimed. An interrupted or failed provider attempt requires review and is not automatically replayed. A blocked email with no send attempt can be retried after configuration is repaired. Resend requests also carry a stable job-specific idempotency key ([provider documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)).

The new acquisition API writes, inquiry submissions, client-file events and mail dispatch are disabled on preview/local deployments so a preview sharing production's database cannot activate a workflow or queue client mail. Configuration and document preview remain readable. No new Gmail permission, third-party connection or client email is needed to deploy the disabled starters.

Lists are bounded to 100 records. Active-project search is a separate lightweight request and respects the contact scope. Full outbox/template pagination, automatic inbound reply association, webhook delivery events, native client signing/payments and general branching workflows remain future work.

## Release verification

Migration `20261017042746_crm_acquisition_workflows.sql` was applied to the Ops Supabase project. Remote checks confirmed RLS on all seven tables, no anonymous file reads or worker RPC execution, zero enabled workflows/ready templates/jobs/issued files, and zero published forms. The business-day/DST result was verified against the remote database. The security advisor returned the same four pre-existing findings and no CRM findings.

The full suite passes 937 tests across 122 files. Coverage includes atomic enrollment, duplicate public retries, task deadlines across DST/weekends, immutable email/file snapshots and responses, lease claims, approval holds, archive/response/disable stop behavior, safe unsent retry, provider ambiguity, auth/CSRF/rate limits and preview isolation. TypeScript, production build and lint pass (10 pre-existing warnings, no errors). Desktop and 390px mobile views were checked; the temporary visual fixtures are excluded from the release. No client email was sent during verification.

Follow-up migration `20261017043251_crm_acquisition_booked_files.sql` distinguishes explicit office file sends from automated lead follow-ups: booked projects can receive a manually issued file, while lead sequences stay stopped. A client response cancels queued workflow messages without cancelling another explicitly requested office file send.


## Standalone client emails and scheduling buttons

Use **Send client email** in Acquisition to send a ready email template to one active project contact. A smart file is optional. The composer shows the recipient and personalized message; its action explicitly queues the email. You can schedule it for a future local date/time within a year. A retry with the same request ID cannot create a second email. Every scheduled email keeps a frozen copy of its message, action button and recipient. Use Outbox to review status or cancel before sending begins.

Email templates have a separate optional button label and HTTPS URL. This supports a public Ops consultation or planning session link independently of a smart file. Both fields must be completed together, credentials in the URL are rejected, and the renderer validates and escapes the link again before sending. The consultation draft points to `https://app.oceanoblue.net/meet/consultation`; publish and verify that session type in **Scheduling links** before marking the email ready. An unused or disabled session type is not a working booking link.

## Booked-client onboarding

Workflows now have two explicit enrollment types:

- **Future website inquiries** start only after a new submission to their selected form, while the project is in an open pipeline stage.
- **Booked-client onboarding** has no contact form and starts only through **Start client onboarding** for a chosen booked project. Importing or booking a project never starts this sequence automatically.

Review the wedding welcome email and planning questionnaire drafts, mark their templates ready, edit the workflow, and enable it. The starter requires approval for its welcome email and creates an assigned office review task due two business days after the manual start. All new starter content is draft and the workflow is paused on deployment. No price, payment deadline, venue, date, cancellation term, or service promise is assumed.

The start dialog shows every step and its approval rule. If a prior reply or archive hold exists, staff must explicitly check **Resume follow-ups**. This removes that hold for future activity while preserving all previously cancelled jobs. An append-only enrollment ledger, project-scoped locking and a unique project/workflow key prevent a repeated start from duplicating emails, files or office tasks. An already-used workflow cannot change between inquiry and onboarding types.

Onboarding stays eligible as a booked project moves between its planning stages, and stops if it returns to an open lead stage or is lost/archived. A client questionnaire response or office reply hold still stops scheduled workflow emails. Existing internal review tasks remain useful follow-up work; archive continues to pause them under the original archive policy. Reopening a project does not restart an old onboarding run.

Migration `20261017114950_crm_onboarding_email.sql` adds the enrollment ledger with office-only RLS and service-only mutation access. Local database tests cover explicit starts, duplicate requests, frozen scheduling buttons, manual emails without files, stage transitions, holds, approval, archival, template readiness, append-only history, and preview isolation. No client or provider email call was made during these tests. Delivery/bounce callbacks and inbound mailbox association remain separate from provider acceptance and are not claimed by this feature.
