# HoneyBook replacement: implementation and migration ledger

This is an ongoing replacement of HoneyBook inside Oceano Blue Ops. The CRM and intake foundation is implemented in this change. Full feature parity and retirement of HoneyBook are not complete.

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

All existing HoneyBook projects will be imported into **Archived** in Ops, regardless of their stale source stage. The HoneyBook account itself stays unchanged. Original stages and stable source project IDs are retained as history. A prepared project CSV importer is available from **CRM → Pipeline → Import HoneyBook archive**; a contacts CSV cannot substitute for a project export.

Historical import creates archived Ops project/opportunity records, adds no follow-up dates or tasks, and does not run inquiry/stage-change automations. Imported clients remain usable for future work. Source IDs and import batch IDs make reimports safe; an intentionally reopened project is not re-archived by a later import.

The default pipeline excludes archived records. Selecting Archived retrieves them. Archiving a CRM project clears its next-follow-up date and pauses existing open project tasks without marking them completed; reopening does not automatically resume those tasks. Historical values remain visible in Archived, while archived records are excluded from conversion and lead-source totals. Existing Ops projects, invoices, payment schedules and unrelated contact tasks are unaffected.

Prepared project CSV columns: **Project ID, Project name, Client name, Client email** (required); **Stage, Project type, Lead source, Project date, Value, Description** (optional). Dates use `YYYY-MM-DD`; values are dollars, or provide a `Value cents` column. Up to 500 projects per batch. The archive policy is implemented; no source projects have been imported yet. The archive migration was applied as `20261017034047_crm_historical_archive.sql`; source mapping history is protected by RLS and its import RPC is service-only. No new security-advisor findings were introduced.

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

The additive migration is applied to Supabase project `hcxqqbnoextequclrvff` as `20261017032908_crm_clientflow.sql`. Remote verification found 13 stages, zero published forms, zero CRM opportunities, 21 existing clients available in the first page, RLS enabled on all nine new tables, and no anonymous access to submissions or action RPCs. Existing security advisor findings were unchanged; none referenced CRM.

No HoneyBook contacts or projects have been imported. The contact export UI was opened and its Download spreadsheet action attempted, but a completed usable download could not be verified. No client message, signature, payment, subscription cancellation or website cutover was performed.

## Existing Ops features that need parity verification

These already exist; a link or similar feature is not proof of HoneyBook parity:

| Area | Existing implementation | Remaining parity work |
| --- | --- | --- |
| Quotes/services | Products, shareable priced quotes | General service packages, client selection, upsells, discounts, taxes, configurable proposals and quote-to-CRM conversion |
| Billing/payments | Order invoices, Stripe checkout, due dates, payment-gated downloads, billing reports | General invoices without real-estate orders, deposits/installments, recurring billing, gratuity, refunds/disputes, autopay, reconciliation and historical payment mapping |
| Contracts | Contractor master agreement signing and audit | Client contracts, multiple signers/countersigning, reusable clauses, project variables, verified signer consent, immutable issued versions, PDF/audit exports and historical signed originals |
| Scheduling | Real-estate booking, availability, Google Calendar, rescheduling and crew assignment | General meeting/session types, reusable links, conferencing, questionnaires, reminders, cancel policies, time zones, historical HoneyBook bookings and calendar deduplication |
| Delivery/client portal | Photo galleries, invoices, downloads, revisions, property sites | Unified client/project portal for conversations, smart files, signatures, questionnaires, payment schedules and participants |
| Team | Office/field permissions and contractors | HoneyBook-equivalent collaborators, project participants and finer permission scopes |

## Required work before HoneyBook retirement

1. Finish the account audit: all form settings and published placements, services, smart-file/email/contract templates, configured automations, scheduling types and availability, company settings, reports, integrations, and mobile-only workflows.
2. Implement client smart files: reusable proposals/brochures/questionnaires/contracts/invoices, ordered blocks and multiple pages, service selection, files/images, conditional questions, versioned issuance, recipient access, completion requirements and audit export.
3. Implement client agreements and the billing gaps above, with verified payment webhooks and exact monetary totals. Preserve original signed files and payment evidence; historical documents must not be re-signed or past invoices recharged.
4. Implement project messaging/inbox: verified sending identity, templates and drafts, explicit send controls, inbound reply association, attachments, delivery/bounce states, conversation history and recipient permissions. New inquiry office notifications and auto-replies are not yet implemented.
5. Complete general scheduling and multi-step automations: timed waits, emails/files, approvals, branches, stop conditions, run history, retries, idempotency and payment/signature triggers. Existing Make/podcast automations do not supply these capabilities.
6. Cover time tracking, expenses/profitability/tax exports, advanced saved views/custom fields/bulk edits, global attachment search, reporting exports, accounting integrations, AI-assisted drafting/enrichment and mobile workflows if required by the account inventory. HoneyBook-provided financing, payment processing and third-party integrations require replacement providers, not UI imitation.
7. Export/archive and reconcile all contacts, projects, participants, notes, form answers, messages and attachments, smart files/templates, original executed contracts and audit trails, invoices, payments and bookings. Keep source IDs and import manifests. A contacts CSV alone does not contain this history.
8. Resolve the repository's dependency release gate, then verify authenticated workflows on the deployed preview. Test end-to-end with isolated records and mail/payment sandboxes.
9. Import existing HoneyBook projects into Archived under the confirmed historical archive policy; reserve active stages for new inquiries or projects explicitly reopened by the office. Publish the verified Ops form, submit an isolated inquiry, check office notification and follow-up, reconcile it with the new contact/project, and only then replace the exact HoneyBook placement on `/contact/1`. Inspect other website pages for placements too.
10. Reconcile active bookings, open balances and in-flight signatures; run both systems through a verified transition window. Retire HoneyBook only when every required capability and historical record is accounted for.

## Validation and release state

CRM tests cover public retry/idempotency, preservation of existing client data, CSV quoting and formula safety, authorization and RPC grants, immutable audit history, version conflicts, atomic project linkage and task automation, global search and pagination. The final full suite passed all 886 tests across 118 files, including 46 CRM-specific tests. Type checking and scoped ESLint passed. A production Webpack build passed; local Turbopack encountered a subprocess port restriction.

The repository's dependency audit currently reports 12 findings (3 moderate, 7 high, 2 critical), involving the existing Tailwind/ESLint/Vitest toolchain. Available fixes require major toolchain changes or incompatible downgrades, so `npm audit fix --force` was not used. CI's high-severity dependency gate remains a release blocker. See the PR's current checks for the final commit result.

Supabase's pre-existing advisor findings include a security-definer view and executable security-definer functions. They are unchanged by this migration. Remediation references: [view permissions](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [anonymous function execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Source references for expected HoneyBook behavior: [contact forms](https://help.honeybook.com/en/articles/3050322-how-to-create-a-contact-form), [contact CSV export](https://help.honeybook.com/en/articles/2650752-download-and-export-your-contacts-list-from-honeybook), [project participants](https://help.honeybook.com/en/articles/2209118-add-contacts-collaborators-or-team-members-to-a-project), [reporting](https://help.honeybook.com/en/articles/2209117-a-guide-to-honeybook-reports-analytics). Account-specific facts above were observed in the signed-in UI.
