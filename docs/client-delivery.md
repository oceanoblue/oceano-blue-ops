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
