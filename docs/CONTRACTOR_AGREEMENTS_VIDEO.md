# Master contractor agreements and isolated video intake

## Scope and rollout

This additive release extends the existing roster and field portal. It does NOT change Karen's photo orders, photo Dropbox folders, assignment dispatch, order statuses, invoices or pay requests. It does not create a contractor, issue an agreement, sign anything, send mail or create Dropbox folders during migration/deployment.

Office routes: `/dashboard/contractors/agreements`, `/dashboard/contractors/video-intake`.
Contractor routes: `/field/agreements`, `/field/video-intake`.

Only active office admins manage master agreements or create/review video handoffs. Other team roles are not office administrators. Contractors are bound by the authenticated account's `auth_user_id`, never by an ID or email supplied by the browser. Historical agreement downloads are intentionally available through the authenticated server route for an inactive contractor's own record. Inactive contractors cannot request signing codes or perform new handoffs.

## Legal draft, not legal certification

The versioned master template is in `lib/contractor-work/template.ts`. Confirm both parties' legal names, their actual worker classification, intended copyright arrangement, payment/cancellation terms, retention, insurance and the limited six-month client-solicitation provision with qualified counsel before issuance. A review checkbox does not claim an attorney approved the document. No broad noncompete, automatic penalty or pay-when-paid clause is included. Accepted existing assignments are not changed retroactively.

Primary research references checked October 15, 2026:
- South Carolina UETA, especially 26-6-50, 70, 80, 90 and 120: https://www.scstatehouse.gov/code/t26c006.php
- U.S. Copyright Office, photographer ownership and limited work-for-hire categories: https://www.copyright.gov/engage/photographers/
- Trade-secret disclosure immunity and contractor notice, 18 USC 1833(b). Review this clause with counsel.
- Supabase RLS guidance: https://supabase.com/docs/guides/database/postgres/row-level-security
- Dropbox file requests and plan limits: https://help.dropbox.com/share/create-file-request
- Dropbox upload guidance: https://help.dropbox.com/sync/upload-limitations

## Signing and preservation

1. An admin creates a draft using explicit company/contractor legal names; the contractor email is resolved from the selected roster record.
2. The admin edits and saves the body, reviews the exact version, types a signature, and expressly adopts the electronic-signature disclosure. `Sign for company & request contractor signature` freezes the parties and terms and emails a private Ops link.
3. The intended contractor signs in with its verified email account, reviews/downloads the record, requests a fresh eight-digit code and intentionally signs with its name plus consent. Requesting a code is not signing.
4. Codes are bound to agreement AND authenticated account via HMAC-SHA256, expire after ten minutes, allow five guesses, throttle requests to one/minute and five/hour, and are consumed in the same locked database transaction as signature completion. Code material is never readable by client roles or written to logs/audit events.
5. Snapshot SHA-256 covers version, both party names, the bound contractor email, exact consent and exact body, separated by newlines. `agreementSnapshot()` defines the canonical UTF-8 text. The database generates the same fingerprint. Exports verify it.
6. Issued terms are immutable; executed and void records cannot be updated/deleted through normal database writes. Audit events are append-only. This does not claim protection against a fully privileged database administrator disabling controls.
7. Signers can download a self-contained printable HTML record, exact canonical TXT, and audit JSON. Open the HTML and use the browser Print/Save as PDF command. This release does not use a PDF certificate, external notarization, government-ID verification or a paid third-party signing provider. No direct PDF generation dependency is introduced.
8. Receipt delivery is best effort and reported separately from the successful signature. Issued or executed records remain available when email fails. Admins can retry invitations/receipts. A template update never rewrites an issued agreement.

All new tables have RLS. Authenticated users have scoped SELECT only; the code-challenge table has no client policies or grants. Service-only signature RPCs are SECURITY INVOKER and explicitly recheck the contractor. No PUBLIC/anon/authenticated execution permission is granted. Mutations require same-origin JSON and server-verified account authorization. Export text is escaped; downloadable HTML has no scripts and disallows network content with CSP. No SSNs, W-9s, bank details or new API credentials are collected here.

## Video intake

Create a handoff in the office UI, then send its invitation. The existing contractor roster remains the source of accounts. This first release tracks file delivery only, not a new event scheduling or video payroll engine. Check master agreement status separately; no retroactive signing gate is imposed on existing workflows.

Upload links use the existing Ops Dropbox OAuth settings, with a separate optional `DROPBOX_VIDEO_INTAKE_ROOT` (default `/Video Intake`). Configuration is rejected if it would place footage inside the photo root. Each intake gets a UUID-based folder and an upload-only Dropbox file request. Original file bytes go directly to Dropbox, not through a Vercel request. Ops does not claim to display Dropbox's upload percentage or provide a separate in-app resumable uploader.

Contractors can upload original video, audio, sidecars and complete-card archives. Camera formats that depend on directory structure should use one intact ZIP per card (without transcoding) or an office-arranged desktop workflow. Every ZIP counts as one uploaded item. Per-file limits and quota depend on the actual Dropbox plan; the app does not claim the connected account has a particular tier or unlimited storage.

`Check uploads` recursively reads all listing pages and fails closed on a continuation error. Submission requires a nonempty, nonzero-size file set, matching contractor-declared item count, audio status, original-file confirmation, completed-upload confirmation and retained-backup confirmation. The stored manifest includes Dropbox content hashes when available. This checks remote file presence, not source-to-destination bit comparison or footage quality.

Submitted != received. The office must review actual footage, then explicitly confirm receipt. Confirmation rechecks that the stored manifest still matches Dropbox and closes the file request. Changes requested sends the contractor back to the upload/submission step. A contractor can reopen a submitted, not-yet-received handoff. Cancellation closes intake and keeps history, without cancelling an underlying job or extinguishing pay obligations. No action updates the photo `orders` status or queues photo enhancement.

## Verification before merge

Run the new PGlite/RLS/signature tests and existing Vitest suite; build, typecheck and lint; inspect CI. Apply the additive migration to the verified Ops project, inspect new RLS/grants/advisors, merge the tested branch, verify the production deployment commit and smoke-test authentication boundaries. Do not send real agreements or fabricate a signature as a test. A real end-to-end contractor signature and large-file upload requires an authorized human signer/uploader, not impersonation.
