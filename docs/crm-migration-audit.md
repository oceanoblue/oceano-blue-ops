# Migration evidence and follow-through

The office review queue is `/dashboard/crm/migration`. It preserves source observations from HoneyBook separately from live Ops projects, payment reconciliation, and appointments. Reviewing or resolving an observation never archives a project, changes a payment balance, cancels a source session, starts an email workflow, or contacts a client.

## Import contract

The service-only RPC `crm_migration_action(p_actor, p_action, p_id, p_version, p_data)` independently requires an active admin or coordinator. For an import, use `p_action='import'`, a fresh batch UUID in `p_id`, null `p_version`, and `p_data={records:[...]}` with 1–200 records. The office API `/api/crm/migration` validates the same contract and permits production writes only. Total payloads are limited to 2 MB.

Each record contains:

- Required: `source_system` (up to 80 characters), `source_kind` (`project`, `payment`, `appointment`, or `settings`), stable `source_id`, `title`, `observed_at` as an ISO timestamp, and a `facts` object (up to 60 KB).
- Source context: `source_url` (HTTPS without credentials, or empty), `project_date` (date or null), `starts_at` and `ends_at` (timestamps or null), and up to 30 short `flags`. End times require a start and must follow it.
- Initial office disposition: `review_state` (`pending` by default, or `active`, `history`, `resolved`), `priority` (`normal` by default, or `urgent`), `next_action`, `owner_id`, `follow_up_at`, and `linked_ops_project`. Assignments must point to an active office member. Links are Ops project UUIDs.

The unique source key is `(source_system, source_kind, source_id)`. Re-imports skip existing keys and return `{imported,skipped}`. They cannot overwrite evidence, dates, flags, or office decisions made since the first import. Use a new source identifier for a separate invoice/session. Do not label a record `resolved` merely because the source is archived: any known unpaid balance, future date, unclear installment, or unverified scheduled session should remain visible for review.

## Review semantics

**Pending** means the observation needs checking. **Active** means the office identified follow-through. **History** records an old item with no current action. **Resolved** means this evidence review is handled. These are review dispositions, not CRM pipeline stages, invoice payment states, or appointment cancellations.

The review editor records a next action, office owner, follow-up time and optional linked Ops project. Every edit requires a reason and the current version. Stale updates return a conflict; the office must reload before changing a newer review. An append-only history stores the before/after review fields and actor. Source facts, source dates, source URLs, and observation timestamps remain immutable. Linked reviews also appear in the relevant CRM activity.

Follow-up dates are internal tracking fields. This queue sends no reminders. Use Scheduling to manage live session links and Project Receivables to verify paid credits, payment schedules and source collection holds. A date-only source project field must not be treated as proof of a booked time slot. Source evidence is rendered as readable labels and values, with uncertainty flags kept visible.

## Complete counts and access

The queue reads 50 observations per page. Search, source kind, review status, and year filters are applied by the server; totals and pagination include every matching row. Summary cards count the entire imported queue across filters, including unassigned and overdue unresolved reviews. A year filter uses the source project date, or the appointment start in `America/New_York` when no project date is present. Undated observations remain visible under All dated and undated records.

Both tables use RLS with office-only reads. Clients and contractors have no mutation access. RPCs are service-only and verify the actor again; the office API checks the session, same origin, JSON body limit and production deployment before writing. Preview deployments can read authorized office evidence but cannot import or review it. Source records contain client information and must not be copied into public pages or support messages.

## Verification

Migration `20261017114951_crm_migration_audit.sql` is tested locally using Postgres in PGlite. Tests cover source-key deduplication after review, immutable snapshots/history, invalid or inactive owners, role/RLS restrictions, stale edits, linked activity, 123-record pagination, global counts, office-timezone year boundaries, HTTP auth/CSRF/preview controls, invalid dates/URLs and bounded imports. No production data is seeded by this migration and no messages are sent.
