# Client gallery delivery

On an order, use **Delivery → Prepare delivery**. The panel shows finished, selected photos and published listing media; choose email, text, or both, review the recipients and message, and click **Deliver to client**. Opted-in teammates can be included explicitly by email. Up to eight recipients are supported per send to keep provider calls within the request deadline.

**Prepare gallery preview** reuses an unexpired gallery link, or creates one if needed. It never sends a message or changes the order status. The legacy `POST /api/delivery-link` without an action now behaves this way too.

**Send a test to yourself** requires explicit test contacts and links only to `/gallery/demo`, using existing public marketing images. It creates a labeled history entry on the order but no live gallery link, no real-client notifications, and no delivered status. The public `/gallery/demo/delivery` page previews the branded email and text alongside a link to the sample client gallery.

Real gallery links retain token access, downscaled unpaid previews with optional watermarks, payment checkout, and download sizes. `/gallery/*` is excluded from indexing. The gallery has a property cover, responsive download controls, photo browsing, and published rich media.

## Delivery results

Email uses Resend; text uses the existing Quo/OpenPhone integration. Keys stay on the server. Each send is recorded in `gallery_dispatches` with its recipients, channel outcomes, provider IDs, actor, and timestamps. Provider acceptance is not a read receipt or proof of delivery to an inbox/handset.

The order and listing advance to delivered only when all requested messages are accepted. Partial failures or uncertain responses stay visible. A row lock and request fingerprint protect repeat requests; a compare-and-set claim prevents concurrent sends. Email calls have Resend idempotency keys. SMS has no assumed deduplication guarantee: interrupted/ambiguous sends are never automatically replayed. After five minutes, interrupted attempts display as needing review. Check the provider before explicitly confirming a resend; resending notifies all selected recipients again.

Access: API handlers require active office staff. The new table has RLS and staff-only reads; writes and the invoker RPCs are service-role only. Do not expose those privileges to browser clients.

## Deployment and verification

Apply `20260917111545_client_gallery_delivery.sql` before deploying the application. This additive schema is compatible with the previous deployment. Unit tests cover provider outcomes, interrupted calls, test recipient isolation, authorization, empty galleries, request replay, preview semantics, RLS, and order/listing status updates. Browser checks cover desktop/mobile email/text previews, gallery navigation, and the delivery panel with mocked sends. A real test uses only contacts expressly supplied by the user.

Settings → Client galleries → Watermark unpaid previews controls every unpaid gallery. Off shows clean 1400px viewing previews; on adds the Oceano Blue overlay. The initial setting is off. Existing team-write RLS controls who can change it. The server reads the global setting for both metadata and each image; URL parameters cannot override it. Images are not cached, and versioned URLs bypass older cached watermarks on the next gallery load. Paid galleries remain clean.

Full-resolution photo URLs and downloadable files remain payment-gated in either mode. Displayed previews can still be saved or captured by a browser; the payment gate protects the delivered files, not screenshots.

## Guided gallery and client photo editing

The real-estate delivery gallery now includes a three-step, skippable quick guide. Dismissal is remembered in this browser, across property galleries; **How to use your gallery** reopens it. The existing MLS and high-resolution ZIP downloads remain unchanged.

**Personalize your photos** offers only small-clutter removal (1 credit, a bounded rectangle) and virtual staging (2 credits, closed room/style choices). Five credits belong to the property **order**, not a token or browser. Gallery links are bearer capabilities: authorized recipients sharing the link also share its balance. Payment must be complete before editing or downloading variants. New variations spend credits; downloads do not. Corrections to the original delivery still use the separate revision request workflow. Additional edits link to a pricing inquiry; there is no automatic charge or credit checkout until pricing is established.

### Review and limits

Office staff use **Dashboard → Reviews → Client photo edits** to compare the original with the generated variant, then explicitly approve or reject it. Every generated result requires human review in this first release. Before approval, no client route signs or serves the result. Rejecting or failing returns credits exactly once. The original remains unchanged; variants are separate, labeled JPEGs up to 2048px, with MLS and full-size variant downloads. These are not full-resolution print replacements. Clutter edits are composited only inside the selected rectangle; the disclosure bar is added separately. Inspect rectangle seams and authenticity as part of review.

Initial controls are enabled with a **100-cent allowance per attempt, 1,000 cents lifetime per order and 5,000 cents daily across all orders (Eastern time)**. These are conservative reservation budgets, **not a guaranteed provider billing cap**. The current adapter's `costCents` is an estimate; provider token usage is retained privately for reconciliation. Verify actual costs and representative results before expanding the allowance. Staff can pause new renders and adjust allowances under the review section. Max 10 lifetime attempts/order, 3 requests/15 minutes/order and one pending/running/review edit/order. Both failed and rejected attempts retain budget usage to prevent free retry abuse.

### Security and operations

- Strict schemas reject free text, extra fields, arbitrary sources, model overrides and client-supplied credit amounts. Only server-owned delivery photos can enter the provider call.
- Reservation is an invoker RPC executable only by `service_role`; it rechecks token expiry, order/photo membership and payment. A global settings lock serializes budget reservations. Request IDs are idempotent, including across different links for the same order.
- All four new tables have RLS with no public/authenticated grants. The `gallery-edits` storage bucket is private with no browser storage policies. Staff routes explicitly require active team membership; public routes return an allowlist of fields. Prompts, usage, cost estimates and raw provider errors are excluded from client responses and bundles. Server prompts are defense in depth, not an authorization boundary.
- Prompts instruct the provider to ignore instructions embedded in image content. Human review remains mandatory because a model cannot guarantee architectural fidelity or correctly recognize all clutter/defects.
- `after()` starts the job after acceptance; a compare-and-set claim prevents duplicate provider calls. `/api/cron/gallery-edits` also processes queued work and fails stale work after 15 minutes. It requires `CRON_SECRET`, is scheduled every minute, and never replays an ambiguous paid generation. Failed settlements are retried by stale recovery. Provider retries are disabled.
- Apply `20261021130126_gallery_guided_edits.sql` before the new routes are used. Existing `OPENAI_API_KEY` / image model configuration and `CRON_SECRET` are reused. Add no client-side API keys. Do not run image-generation smoke tests against a real client order without selecting an authorized test photo.

Validation: Postgres/PGlite tests cover grants/RLS, payment/photo/token gates, idempotency, shared balances, single refunds, budgets, throttles and review transitions. API and runner tests cover public response projection, approved-only downloads, staff review, strict input rejection, claim contention and ambiguous failures. Image tests verify containment outside the selected rectangle and output sizing/disclosure.
