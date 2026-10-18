# CRM and existing operations regression audit

Audit date: October 18, 2026. Baseline: `70831b5` (inquiry inbox release); comparison with pre-CRM `f9aa333`.

The CRM shares the client directory and staff calendar with real estate and production operations. Its import must not hide existing work, and appointments must reserve the same crew time regardless of which booking flow runs first.

## Issues corrected

- **Client directory truncation.** The imported directory exceeded the REST response cap. Seven office pages previously loaded only the first 1,000 clients, omitting later alphabetic clients from real estate, podcast, listing, delivery and team selectors. The shared helper now pages through the complete directory using the caller's authenticated Supabase client, stable name/ID ordering and existing archive filters. Errors, changing counts and incomplete pages produce a visible error rather than an incomplete selector. Podcast publishing and episode access remain independent of selector loading.
- **Archived projects hiding production.** The Projects page's newest-100 query could show only imported archive history. Current projects are now filtered in the database before pagination. Current, Archived and All views, project-name search and server pagination retain access to the full archive. Errors and missing counts do not display a misleading partial list.
- **Staff schedule conflicts.** Staff order rescheduling and crew assignment now check canonical CRM reservation blocks at the database boundary, using each crew member's actual visit window and the existing business buffer. The deliberate staff overlap override, released holds and status-only delivery/billing updates retain their existing behavior. Owner locks match the public booking and CRM commit locks.
- **Travel buffer in both booking directions.** CRM availability and authoritative create/change checks preserve the real estate business buffer around existing shoots. Session-specific before/after buffers still apply to CRM appointment holds.

## Verification boundaries

The automated regression suite covers public real estate booking and rescheduling, crew scheduling, Stripe dispatch and legacy order settlement, billing and download access, podcast production, deliveries, operations agents, paid attempts, workflow execution, authorization and calendar integration. New tests reproduce imports beyond 1,000 rows, incomplete list responses, staff moves into CRM holds, crew-specific windows, explicit overrides, production completion and scheduling buffer boundaries.

Read-only production browser checks cover public `/book`, office shoot entry, podcast show and episode controls, Overview and the crew schedule. No real client booking, payment, refund, publishing action or client communication is created during this audit. Full external Make/Transistor publishing and real financial transactions are outside these checks.

Production contained 1,120 clients (1,119 active), 9 current projects and 1,024 archived projects before this release. Security advisor output is compared before and after migration; existing findings are not a clean-security certification.

Release checks: all **1,203 tests across 147 files** pass. Local typecheck passes; ESLint has zero errors and the same ten pre-existing warnings. The local Next production build is blocked by the environment's font-network/process-binding restrictions, so the standard Node 24 GitHub CI build is required before merge. Both migrations were applied and their function permissions/trigger enablement verified; security advisor finding counts are unchanged.

## Existing follow-up items

- Legacy real estate refund/dispute webhook events predate this CRM work and do not automatically change order paid state/download access. A separate policy and implementation review is needed before changing that behavior, especially for partial refunds.
- Overview already lists historical production jobs and photo-processing failures needing review. Rendering those existing items does not establish that external production/publishing has completed successfully.
- HoneyBook retirement still requires the separate reconciliation and cutover work recorded in `crm-transition-release.md`; this regression audit does not clear those holds.

## Recovery

Application rollback restores the previous deployment. The database additions are additive scheduling protections and do not rewrite existing orders, prices, payments, appointments or imported history. If a scheduling regression is confirmed, disable the new order reservation trigger and restore the previous CRM scheduling function definitions in a reviewed migration; keep existing reservations intact.
