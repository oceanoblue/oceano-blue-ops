# HoneyBook replacement: implementation and migration ledger

This is the migration ledger for the ongoing replacement of HoneyBook inside Oceano Blue Ops. Dated release evidence below is historical; the October 17 addendum records subsequent work. Full feature parity and retirement of HoneyBook are not yet certified.

## Verified account and website inventory (October 16, 2026)

The signed-in Oceano Blue Media HoneyBook account shows 1,110 contacts and these pipeline counts:

| Stage | Projects |
| --- | ---: |
| Inquiry | 118 |
| Follow-up | 349 |
| Meeting | 0 |
| Proposal sent | 339 |
| Proposal signed | 11 |
| Retainer paid | 53 |
| Planning | 205 |
| Editing | 0 |
| SEND Gallery | 1 |
| Completed | 9 |
| FeedBack | 0 |
| Archived | 59 |

These are account UI counts, not a reconciled export. The 12 stages total 1,144 projects. Ops seeds the same stage names and ordering plus an optional Lost stage. Outcome classifications are implementation defaults and must be reconciled against the business's booking definition.

The template inventory contains Corporate, Default Contact Form, and Gustavo Rattia Website contact forms, along with smart-file categories for brochures, contracts, invoices, proposals, questionnaires, and a custom 1 OCEANO TV folder. Lead capture shows one form and one draft. This inventory does not certify those templates have been migrated.

The live website's contact destination is `https://www.oceanoblue.net/contact/1`. Its HTML contains the HoneyBook website placement `5dde6b893bf0cf001839b151`, a placement controller script, and a tracking image. The older `/contact` path is not the current destination. The account's Default Contact Form direct widget uses form ID `5d9665b84422f80446fc3caa`; its exact relationship to the active placement still needs verification.

The inspected default form asks for name, email, phone, project date, address, project type, guest count, estimated time, budget, referral source, and project details. Ops provides a **draft** with those labels. Original project-type and referral dropdown choices, conditional behavior, branding, routing, redirects, notification recipients, and the other forms still need reconciliation. The replacement uses text for the unverified dropdown choices rather than inventing source values.

## Historical archive policy (confirmed by the owner)

The default for historical HoneyBook projects is import into **Archived** in Ops, regardless of stale source stage. Explicit active commitments identified by the owner are exceptions and must remain active. Onellis’s January 7, 2027 wedding is an active Planning exception. The HoneyBook account itself stays unchanged. Original stages and stable source project IDs are retained as history. A prepared project CSV importer is available from **CRM → Pipeline → Import HoneyBook archive**; a contacts CSV cannot substitute for a project export.

Historical import creates archived Ops project/opportunity records, adds no follow-up dates or tasks, and does not run inquiry/stage-change automations. Imported clients remain usable for future work. Source IDs and import batch IDs make reimports safe; an intentionally reopened project is not re-archived by a later import.

The default pipeline excludes archived records. Selecting Archived retrieves them. Archiving a CRM project clears its next-follow-up date and pauses existing open project tasks without marking them completed; reopening does not automatically resume those tasks. Historical values remain visible in Archived, while archived records are excluded from conversion and lead-source totals. Existing Ops projects, invoices, payment schedules and unrelated contact tasks are unaffected.

Prepared project CSV columns: **Project ID, Project name, Client name, Client email** (required); **Stage, Project type, Lead source, Project date, Value, Description** (optional). Dates use `YYYY-MM-DD`; values are dollars, or provide a `Value cents` column. Up to 500 projects per batch. At the initial archive release, no source projects had been imported. This is a dated baseline, not the current migration total; see the October 17 addendum. The archive migration was applied as `20261017034047_crm_historical_archive.sql`; source mapping history is protected by RLS and its import RPC is service-only. No new security-advisor findings were introduced.

## Implemented by this change

- `/dashboard/crm`: global contact/project search; paginated contacts; tags, company, phone, address, notes, lead/client/archive relationship; editable pipeline stages and project owners, values, dates, sources, loss reasons and next follow-up.
- Contact workspace: CRM projects, preserved inquiry answers, internal notes/activity, tasks, and links to the existing production jobs, properties and order invoices.
- Customizable inquiry forms with labels, required fields, answer types, select options, question order, owner, default project type, confirmation message, publication switch, direct links and website iframe embeds.
- `/inquire/[slug]`: responsive public inquiry form. Submission atomically finds/creates an existing Ops client, creates a production project and sales opportunity, stores a snapshot of the form and answers, appends activity, and runs enabled inquiry task automations.
- Idempotent public retries; existing client details cannot be overwritten by public submissions; honeypot, durable fail-closed rate limiting, bounded request bodies and server-side validation.
- Internal task automations triggered by inquiry submission or an actual stage change. Stage task creation is part of the transaction. This is **not** a general workflow/email automation engine.
- HoneyBook-compatible contact CSV import with preview, 500-row batches, email duplicate skipping, retry-safe import IDs, and page-scoped CSV export with spreadsheet formula escaping. Skipped contacts are not merged or updated.
- Reports over all CRM opportunities: value by stage, source, won-project count, contact count and overdue tasks. Opportunity estimates are separate from collected revenue.
- Office-only APIs and RLS: active admins and coordinators. Clients, contractors, photographers and editors cannot use the CRM. Service-only RPCs recheck the actual session actor. Mutations use optimistic versions; audit/submission/import history is append-only.

The additive migration is applied to Supabase project `hcxqqbnoextequclrvff` as `20261017032908_crm_clientflow.sql`. Initial migration verification found 13 stages, zero published forms, zero CRM opportunities, 21 existing clients available in the first page, RLS enabled on all nine new tables, and no anonymous access to submissions or action RPCs. Those row counts describe that initial verification only. Existing security advisor findings were unchanged; none referenced CRM.

At the initial CRM release, no HoneyBook contacts or projects had been imported. The contact export UI was opened and its Download spreadsheet action attempted, but a completed usable download could not be verified. No client message, signature, payment, subscription cancellation or website cutover was performed in that release. Subsequent source observations and the explicit active wedding exception are tracked below.

## Existing Ops features that need parity verification

These already exist; a link or similar feature is not proof of HoneyBook parity:

| Area | Existing implementation | Remaining parity work |
| --- | --- | --- |
| Quotes/services | Products, shareable priced quotes | General service packages, client selection, upsells, discounts, taxes, configurable proposals and quote-to-CRM conversion |
| Billing/payments | Order invoices, Stripe checkout, due dates, payment-gated downloads, billing reports | October 17 adds general project receivables, immutable source credits, installments, reconciliation holds and client-initiated Stripe checkout. Recurring billing, gratuity, refunds/disputes, autopay and complete historical reconciliation still need parity verification |
| Contracts | Contractor master agreement signing and audit | Client contracts, multiple signers/countersigning, reusable clauses, project variables, verified signer consent, immutable issued versions, PDF/audit exports and historical signed originals |
| Scheduling | Real-estate booking, availability, Google Calendar, rescheduling and crew assignment | October 17 adds general session types, reusable links, host-calendar checks, time zones, client management links, confirmations and reminders. Verify published settings and historical appointments; conferencing, questionnaires and source-policy parity still need reconciliation |
| Delivery/client portal | Photo galleries, invoices, downloads, revisions, property sites | Unified client/project portal for conversations, smart files, signatures, questionnaires, payment schedules and participants |
| Team | Office/field permissions and contractors | HoneyBook-equivalent collaborators, project participants and finer permission scopes |

## Required work before HoneyBook retirement

1. Finish the account audit: all form settings and published placements, services, smart-file/email/contract templates, configured automations, scheduling types and availability, company settings, reports, integrations, and mobile-only workflows.
2. Complete client smart-file parity. The acquisition extension now supplies ordered text, secure links, questionnaires, immutable issuance, private recipient links and response tracking. Native proposals/services, contracts/invoices, multi-page layouts, images/uploads, conditional questions and audit/PDF export remain.
3. Finish client agreements and the remaining billing gaps above. Verify the new project-receivable checkout/webhook path and exact source credits before enabling collection. Preserve original signed files and payment evidence; historical documents must not be re-signed or past invoices recharged.
4. Implement project messaging/inbox: verified sending identity, templates and drafts, explicit send controls, inbound reply association, attachments, delivery/bounce states, conversation history and recipient permissions. New inquiry email replies and scheduled follow-ups are now configurable in the acquisition workspace; automatic inbound reply association and office email notifications remain.
5. Verify the general scheduling links, connected host calendars, notifications and imported bookings end-to-end. Inquiry-triggered sequences support timed emails/files, approval holds, business-day office tasks, stop controls and an outbox; explicit booked-client onboarding is added in the October 17 extension. General branching, scheduling/payment/signature triggers and inbound email response triggers remain. Existing Make/podcast automations do not supply those missing capabilities.
6. Cover time tracking, expenses/profitability/tax exports, advanced saved views/custom fields/bulk edits, global attachment search, reporting exports, accounting integrations, AI-assisted drafting/enrichment and mobile workflows if required by the account inventory. HoneyBook-provided financing, payment processing and third-party integrations require replacement providers, not UI imitation.
7. Export/archive and reconcile all contacts, projects, participants, notes, form answers, messages and attachments, smart files/templates, original executed contracts and audit trails, invoices, payments and bookings. Keep source IDs and import manifests. A contacts CSV alone does not contain this history.
8. Verify the remaining workflows end-to-end with isolated records and mail/payment sandboxes. The dependency release gate is preserved and the upgraded dependency tree audits clean.
9. Review this year’s and next year’s source commitments before a broad archive import. Import historical projects into Archived under the confirmed default; keep owner-confirmed active projects, including Onellis’s wedding, in their active stage. Publish the verified Ops form, submit an isolated inquiry, check office notification and follow-up, reconcile it with the new contact/project, and only then replace the exact HoneyBook placement on `/contact/1`. Inspect other website pages for placements too.
10. Reconcile active bookings, open balances and in-flight signatures; run both systems through a verified transition window. Retire HoneyBook only when every required capability and historical record is accounted for.

## Interface and performance improvements

The workspace opens with server-rendered, authorized CRM data and shared summary totals. Switching sections fetches only that section's tasks, forms or automations; pipeline/contact searches no longer reload hidden sections or a redundant global event feed. Obsolete requests are cancelled and late responses cannot replace the current results. Reports reuse the summary response.

The visual review covers desktop and a 390px mobile viewport: brand fonts/colors, summary cards, horizontally scrollable section navigation, comfortable 44px form controls, keyboard focus, project drawer, responsive filters and useful empty states. Empty pipeline stages are optional, so a new or filtered workspace does not force a dozen empty columns. Draft record IDs remain stable through failed save retries. Tailwind's official migration updates shared utility names throughout Ops while preserving its existing brand tokens, transitions and reduced-motion behavior.

## Validation and release state

CRM tests cover public retry/idempotency, preservation of existing client data, CSV quoting and formula safety, authorization and RPC grants, immutable audit history, version conflicts, atomic project linkage and task automation, global search and pagination. The full suite passed all 892 tests across 120 files, including 51 CRM-specific tests and a Next ESLint glob compatibility check. Type checking and full ESLint passed (10 existing warnings, no errors). The upgraded production Turbopack build is also verified before release. Temporary local visual fixtures are excluded from the release.

The release upgrades Next.js/ESLint to 16.4.2, Tailwind/PostCSS to 4.3.3, Vitest to 5.0.5, Vite to 8.3.4 and tailwind-merge to 3.7.0. `npm audit` reports zero vulnerabilities; the existing high-severity CI gate remains enabled. Next ESLint's only fast-glob call uses `globSync` to discover project directories; a narrowly scoped npm alias replaces that dependency with tinyglobby 0.2.17. A regression test verifies default, globbed and multiple project roots and excludes files. Vitest mock lifetime remains explicit, and the calendar mock has a callable type compatible with Vitest 5. No lint rule or release check was disabled for this upgrade.

Supabase's pre-existing advisor findings include a security-definer view and executable security-definer functions. They are unchanged by this migration. Remediation references: [view permissions](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [anonymous function execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Source references for expected HoneyBook behavior: [contact forms](https://help.honeybook.com/en/articles/3050322-how-to-create-a-contact-form), [contact CSV export](https://help.honeybook.com/en/articles/2650752-download-and-export-your-contacts-list-from-honeybook), [project participants](https://help.honeybook.com/en/articles/2209118-add-contacts-collaborators-or-team-members-to-a-project), [reporting](https://help.honeybook.com/en/articles/2209117-a-guide-to-honeybook-reports-analytics). Account-specific facts above were observed in the signed-in UI.

## Acquisition extension

The reply/workflow and smart-file extension is documented in [acquisition-workflows.md](acquisition-workflows.md). It preserves the historical archive policy and does not publish a form or change the website placement. Starters remain disabled and no existing records are enrolled. Email provider/cron configuration names were confirmed present; no credential values were read or changed and no real client email was sent during development.


## October 17, 2026 implementation and migration addendum

The owner explicitly identified **Onellis’s wedding on January 7, 2027** as active work. Its Ops project is in **Planning**, with assigned internal follow-through; it must not be swept into a historical archive batch. Its stable HoneyBook source mapping protects it from duplicate import or rearchival. This exception does not authorize changing HoneyBook’s pipeline or contacting the client.

The account audit is now checking source projects dated in 2026 and 2027, outstanding-payment evidence and scheduled sessions. The old zero-import statements above describe the initial release. They must not be used as current totals, and source UI pipeline counts must not be represented as a reconciled migration export. Current observations, uncertainty flags, office owners and next steps belong in the [Migration review queue](crm-migration-audit.md). The audit remains in progress until source balances, schedules and commitments have been checked and linked to their Ops records. No completion count is asserted by this addendum.

This release extends the CRM with:

- **Project Receivables** at `/dashboard/crm/billing`: evidence-backed source totals and paid credits, remaining installments, verified/uncertain dates, explicit reconciliation and collection holds, external receipts, private payment links and Stripe settlement review. Importing evidence never enables collections. Confirm the source can no longer charge or accept another payment before enabling Ops links; do not recreate a paid invoice as a fresh charge.
- **Scheduling links** at `/dashboard/crm/scheduling`, with public booking at `/meet/[slug]`: general meeting/session types, host Google Calendar checks, buffer/notice/horizon controls, bounded booking and management APIs, private client change links, office cancellation and notification status. Source appointments require explicit evidence and deduplication; a project date by itself is not a verified appointment time.
- **Client emails and onboarding** in `/dashboard/crm/acquisition`: standalone ready-template emails with optional smart files, future send times, separate reviewed HTTPS scheduling buttons and an explicit booked-project onboarding start. A unique project/workflow enrollment prevents repeat starts from sending duplicates. Historical imports never enroll a client. New wedding/consultation copy and the planning questionnaire remain drafts until reviewed; enabling a workflow is separate from starting a client.
- **Migration review** at `/dashboard/crm/migration`: immutable dated source facts, uncertainty flags, owner/next-action/follow-up tracking, versioned review decisions and append-only reasons. All source rows are searchable with server pagination and global counts. A resolved review is separate from payment reconciliation or project completion.

New public scheduling and checkout APIs use durable rate limits that fail closed if counts cannot be verified. Client token pages suppress caching, referrers and indexing. Office billing, scheduling, acquisition and migration endpoints retain session and role checks; public booking/manage/checkout routes authorize using their own scoped links and validation. Worker routes require their server secret independently of public page routing.

Native client agreements/e-signatures, full smart-file proposal/payment blocks, inbound mailbox reply association, delivery/bounce synchronization, complete source archives and remaining payment/accounting parity are still tracked gaps. A successful deployment of these extensions is not permission to cancel HoneyBook while active balances, scheduled sessions or required records remain unresolved.
