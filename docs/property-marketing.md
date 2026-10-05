# Property pages and performance

Open an existing Real Estate order → Property marketing → Open property marketing.
Save a draft, preview, then publish once media is unlocked. Listing address, bedrooms,
bathrooms, square footage and selected deliverable photos come from existing records.
Optional fields include asking price, acreage, highlights, brokerage, MLS number,
agent photo/logo, featured film, social videos, floor plan and tour. Use approved
public HTTPS links. The custom address is optional; existing UUID links still work.
The unbranded view hides agent branding and the inquiry form. Review media and MLS
requirements separately before using that link in MLS.

Campaign links tag Instagram, Facebook, email and print traffic. The print QR code
is a locally generated SVG, without exposing the URL to an external QR service.
Website events use a temporary per-property session identifier, not IP addresses,
browser fingerprints or identified visitors. Do Not Track and Global Privacy
Control disable activity recording. Automated traffic filtering is best effort;
counts are marketing measurements, not audited visitor counts. Sessions are
approximate visits, not unique people. Vimeo events record starts and milestones
reached; seeking may cross milestones. Other films and social players are not
tracked for playback. Metrics do not include native Instagram/Facebook, MLS or
Zillow views. Traffic dates are Eastern Time.

Analytics shows 7/30/90/365-day ranges and the latest 100 inquiries. Clicks and
saved inquiries are separate metrics. A submitted form saves first, then emails
the configured public agent email through the existing transactional provider.
Duplicate submission IDs prevent duplicate notifications. The report shows
provider acceptance, failure, missing configuration or no recipient. Pending can
mean an interrupted send; check the provider before resending manually. No
automatic notification retry is enabled.

Create a private realtor report link from the editor. It lasts 180 days and is a
bearer credential: anyone holding it can see that property's report and inquiries.
Only its hash is stored in a server-only table. Creating a replacement invalidates
the prior link; Revoke immediately removes access. Never put this link in public
campaigns. Reports are no-store, noindex and no-referrer. Weekly emailed reports,
custom domains, self-service client editing and MLS integrations are future work.

Migration: property_performance. Tables: property_events, property_inquiries,
property_report_access. All use RLS. Public clients have no direct table grants;
staff can read events/inquiries; writes and report aggregates are server-only.
Existing booking, gallery, payments, dispatch and delivery behavior is unchanged.

Verification: marketing route and database permission tests, full existing unit
suite, TypeScript, production build, lint, production dependency audit, with browser verification unavailable in this environment. Existing development dependency audit findings in braces
and Vitest remain, without a compatible released fix for the braces advisory.
