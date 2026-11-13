# Social media client onboarding

`/social/start` is the page a new social media client fills in so Oceano Blue Media can start managing their accounts. It replaces the back-and-forth email asking for access, logos and a brand guide. One link works for every client.

## What the client does

1. **Your details**: business, contact and which package they are starting with.
2. **Account access**: for Facebook, Instagram and YouTube they give the link or handle and say whether they added us, need help, or don't have the account. Each platform has click-by-click steps for inviting `info@oceanoblue.net`. The page never asks for a password.
3. **Brand and content**: brand guide (or "create a look for us"), tone, colors, goals, audience, areas to reach, topics, on-camera comfort, how they approve posts, interest in paid promotion.
4. **Your files**: an upload box for logos, brand guides, headshots, photos and videos, plus a field for a Dropbox or Google Drive folder link.

Sending saves the answers first, then uploads the files one at a time with progress. If a file fails, the answers are already saved and the client can retry just the files.

## What the office sees

`/dashboard/crm/social-onboarding` (admin and coordinator) lists each intake with the answers, where the client is on access for each platform, and the files grouped by type. Files download through five-minute signed links. "Copy client link" copies the public page address. If `CRM_INQUIRY_ALERTS_ENABLED=1` and `CRM_INQUIRY_ALERT_TO` are set (the same settings the inquiry inbox uses), the office also gets an email for each new intake.

Intakes are not linked to CRM contacts or projects yet.

## Deployment

Apply `20261113140000_social_onboarding.sql` before deploying the code. It adds two tables (`social_onboarding_submissions`, `social_onboarding_files`) and a private `social-onboarding` storage bucket. No existing data changes.

Like the other public forms, sending and uploading only work in production. Preview deployments show the page read-only.

## Limits and safeguards

- Up to 40 files per client, 2 GB per file, 10 GB per client. Larger libraries go in the folder link field.
- File types are allowlisted by extension (images, video, PDF and office documents, design files, fonts, ZIP). The list is in `lib/social-onboarding/schema.ts`.
- The bucket is private with no browser policies. Uploads use one-time signed upload URLs issued by the server for a path the server chooses; files over 6 MB use resumable uploads so a dropped connection resumes.
- A client can only add files to their own intake, for 24 hours after sending, using a secret their browser holds.
- Same-origin JSON only, a honeypot field, per-address rate limits, and a daily ceiling on upload requests across all clients.

## Changing the questions

Questions, choices, the invite email shown to clients and the upload rules live in `lib/social-onboarding/schema.ts`. The public page, the validation and the office view all read from it. The access steps for each platform are at the top of `components/social/SocialOnboarding.tsx`; check them against Facebook and YouTube now and then, since those menus change.
