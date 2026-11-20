# Social Studio

`/dashboard/social` is where Oceano Blue Media runs social media for clients:
who each client is, which sub-accounts they have, what each one is owed every
month, where every piece of content is in production, and whether we have
enough media to keep going. It is built for clients with many sub-accounts,
such as a hotel group.

Social onboarding (`/social/start`, see `social-onboarding.md`) collects a new
client's answers and files. Social Studio is what happens after that.

## How it is organized

- **Client**: one company we manage social media for (in the database, a
  `social_programs` row). It has a contact, a status, the tool posts are
  published from, the terms it was sold on and its agreements.
- **Sub-account**: one hotel, outlet or brand page that belongs to a client
  (`social_accounts`). It holds the monthly quota (posts, reels, Google posts),
  the platforms it is on with a link to each profile, the Canva brand kit
  link, the media folder link, voice and style notes, and whether we have
  access. A hotel group is one client with one sub-account per hotel.
- **Piece**: one post, reel or Google post for a sub-account in a month. It has
  a content type, a working title, a caption, a publish date, an assignee, a
  Canva design link, review notes and a stage.
- **Media batch**: a note that photos or clips arrived for a sub-account.
- **Media request**: something we have asked the client to send.

## Where things are

- `/dashboard/social` lists every **client** as a card with this month at a
  glance. "Add a client" is at the bottom.
- `/dashboard/social/clients/<id>` is that client's own **dashboard**: the
  month in numbers, what needs attention, what is due in the next 7 days,
  "Plan the month", the onboarding checklist, the client report link, the
  agreement status and every sub-account with a progress bar.
- The tabs on a client are **Sub-accounts** (one table of every sub-account,
  and where new ones are added), **Production board**, **Calendar**,
  **Checks** and **Agreement** (agreements, plus fee, term and brand rules).
- `/dashboard/social/accounts/<id>` is one **sub-account**. The trail at the
  top always reads Social Media / client / Sub-accounts / sub-account.
- Links from before clients had their own pages (`?program=<id>`) are sent to
  the right place.

The production board shows the month's pieces in columns by stage; the
calendar shows them by date. Open a piece in either to edit it.

## Planning a month

"Plan the month" creates every piece each active account is owed, with a
content type and a suggested date spread across the month. Posts rotate through
property feature, local event, property feature, local story, flexible, so five
posts give the 2-1-1-1 mix. It only adds what is missing: running it again, or
after adding accounts or raising a quota, never duplicates or resets work.

## Adding sub-accounts

On the client's Sub-accounts tab, paste one sub-account per line and pick the type. A line can include the account's
profile links and its Canva brand kit link after the name, so a client's account list can be pasted from a
spreadsheet:

```
Hampton Inn Example City | https://www.facebook.com/... | https://www.instagram.com/...
```

Links are matched to a platform by their address. Each type starts with a
default quota (Standard 5 posts and 1 reel; High volume 13 posts and 2 reels;
Corporate 8 posts, 2 reels and 2 Google posts) that can be changed per account.

## Media supply

Each account shows Media OK, Media low or Needs media. It compares what arrived
in the last 90 days with what a month needs (one photo per post, three clips per
reel): two months of cover is OK, one is low, less is "needs media". "Copy media
request" on the overview builds a ready-to-send list for the client.

## Checks

Every piece is checked automatically, and the results show on the Checks tab,
on board cards and inside the editor. "Must fix" items are errors; "worth
checking" items are warnings. Nothing is blocked in the office screens, but the
Make bridge will not hand over an approved piece that still has an error.

Errors: no caption or no publish date once a piece is ready; a caption too long
for Instagram or Google; more than 30 hashtags on Instagram; a term the program
or account says to avoid; the same caption twice on one account in a month; a
leftover `[placeholder]`.

Warnings: no design link; a publish date outside the month; a date that has
passed (scheduled but not marked published, or not scheduled at all); work in
production with nobody assigned; a caption too long for X, LinkedIn or TikTok; a
link in an Instagram caption; mostly capital letters.

Terms to avoid are set per program (Program details) and per account (Account
profile). The rules live in `lib/social/audit.ts`.

## Program details and onboarding

"Terms and brand rules" on the Agreement tab hold what the client bought: monthly fee, the rate for an
account added or removed, a minimum monthly fee, term start and length, the day
of the month media is due, a link to the signed agreement, and terms to avoid.
These are records for the office; nothing is invoiced from them.

The onboarding checklist is the same twelve steps for every client, from
"Agreement signed" to "Monthly report set up". Ticking a step records the date.

## Drafting captions with AI

"Draft with AI" in the editor writes a first draft from the working title and
the account's voice notes, using the model chosen in Operations settings. It is
told to use only the facts it is given and to leave a `[placeholder]` for
anything it does not know, which the checks then flag until someone fills it
in. The draft goes into the editor only; nothing is saved until Save.

## Logos

A client and each of its sub-accounts can have a logo. Tap the logo tile (it
has a small camera badge) on the client's dashboard, in the Sub-accounts
table or on a sub-account's page, and choose a PNG, JPEG or WebP image up to
3 MB. PNG with a transparent background looks best. Until a logo is added the
tile shows the name's initials.

After a sub-account's logo is uploaded from the Sub-accounts table, the page
offers the same logo to the other sub-accounts whose name starts with the same
word and that have none yet (for example every "Courtyard"), so a brand's logo
is uploaded once.

The server re-encodes every upload as a PNG no larger than 512 pixels and
stores it under `social-logos/` in the public `public-assets` bucket. Logos
also appear on the client's report page.

## Charts on a client's dashboard

- **The header**: the share of the month's pieces that are scheduled or live,
  with a bar that also shows what is still in production.
- **By planned date**: one column per day, split into scheduled or live and
  still in production. Point at a day, or use the arrow keys, for its numbers.
- **Where every piece is**: a bar per stage, in pipeline order.
- **Media supply** and **Account access**: sub-accounts in each state.
- **Where they post**: sub-accounts on each platform.

Chart colors live in `components/social-studio/Charts.tsx` (`VIZ`): one blue
ramp for amounts and progress, and green, amber and red only for good, warning
and problem states, always with a label.

## The client's page

Each client can have a private page at `/social/report/<secret>`. Create the
link from the client's dashboard ("The client's page") and send it to the
client. It shows one month at a time, by sub-account. On it the client can:

- **See where every piece is**: in progress, ready for their review, approved,
  scheduled or live. A caption and design link appear only once a piece has
  reached client review.
- **Approve a piece** that is waiting for their review, or **approve all** the
  pieces waiting for one sub-account in the month on screen.
- **Ask for a change**, with a note. A piece under review goes back to "In
  design". A piece that is already approved, scheduled or live stays where it
  is, and a failed check ("The client asked for a change") holds it from
  scheduling until the office makes the change and sends it back for review,
  or opens the piece and chooses "Mark as handled".
- **Send a note** to the team, optionally about one sub-account. Notes show in
  "From the client" on the client's dashboard until marked done.
- **Send photos and video**: a button opens the link saved in "Where the
  client sends photos and video" (Agreement tab, Terms and brand rules).

The office is emailed when a client asks for a change or sends a note.
Approvals are quiet. Open notes are also counted in the daily alert.

### What a client can and cannot see

The page has no sign-in, so the link itself is the key: anyone holding it can
use the page. "New link" replaces the secret, which stops the old link
working; "Switch off" removes it.

- A link opens **one client only**. Every piece and sub-account a client acts
  on is checked on the server against the client the link belongs to; another
  client's, a paused sub-account's, or a piece not yet shown to the client is
  answered as "not found".
- The page never carries fees, terms, agreements, staff names or assignees,
  internal review notes, check results, access notes, voice notes, or another
  client's data. The name a person types is recorded with their answer; it is
  not verified.
- Clients cannot reach `/dashboard/social` or `/api/social`: both require a
  signed-in office account (admin or coordinator). The database tables refuse
  everyone except office staff, including signed-in clients and field staff.

## Agreements signed in the system

On a client's **Agreement** tab:

1. **New agreement**: paste the text. A line starting with `# ` is a main
   heading and `## ` a section heading. Anything left in [square brackets] is
   counted as still to fill in.
2. **Get the signing link**: this locks the text and creates a private link
   (`/social/agreement/<secret>`). Nothing is emailed; send the link yourself.
3. The client reads it, types their name, title and email, ticks the consent
   box and signs. The office gets an email.
4. **Countersign**: the agreement is then complete, the onboarding step
   "Agreement signed" is ticked, and the same link shows the signed copy with
   both signatures. Print that page to save a PDF.

What is recorded with each signature: the name, title and email typed, the
time, the consent wording shown, a SHA-256 fingerprint of the exact text, and
for the client a hash of their network address. A sent agreement cannot be
edited: cancel it and send a new one. A fully signed one cannot be cancelled.

This is a simple typed-name signature, the same kind the booking files use.
Have an attorney review the agreement text itself before it is sent.

## Daily alert

`/api/cron/social-digest` runs once a day (12:30 UTC, see `vercel.json`) and
emails the office only when something needs someone:

- **Active clients**, every day: pieces failing a check or held back from
  scheduling (this month and next), pieces past their date, sub-accounts out
  of or low on media, sub-accounts without confirmed access, media requests
  past their date and, from the 20th, a next month that is not fully planned.
- **Clients being onboarded**, Mondays only: how far onboarding is and the
  next step.
- Paused, ended and prospect clients are left alone.

It goes to `SOCIAL_ALERT_EMAIL`, or the office reply address when that is not
set. Running it twice in a day sends one email. Preview deployments never
send.

## Make bridge

`/api/automations/social` lets a Make scenario schedule approved content. It
uses the same `x-pos-automation-secret` header as the podcast bridge.

- `GET ?client=<client id>&month=YYYY-MM` returns `ready` (approved pieces
  with account, platforms, profile links, caption, design link and publish
  date) and `held` (approved pieces with an error, and why).
- `POST { "id", "event": "scheduled" | "published", "published_url"? }` records
  what the publishing tool did. A piece only moves forward (approved, then
  scheduled, then published); repeats are accepted and anything else is refused.

The bridge does not publish anything itself. Make reads the ready pieces, sends
them to the publishing tool, and reports back.

## Canva and publishing

Canva and the publishing tool are linked, not connected. Each account stores its
Canva brand kit link and each piece stores its Canva design link, so the design
is one click from the card. Posts are published from the client's publishing
tool (for example Statusbrew); mark a piece Scheduled when it is loaded there
and Published when it is live. Direct connections (creating Canva designs from
here, or publishing to Facebook and Instagram from here) need each service's
developer access and are not part of this version.

## Deployment

Apply `20261118130000_social_studio.sql`,
`20261120160000_social_studio_programs.sql`,
`20261120190000_social_studio_clients.sql`,
`20261120200000_social_studio_logos.sql` and
`20261120210000_social_studio_client_side.sql`, in that order, before deploying the code. The first adds five
tables (`social_programs`, `social_accounts`, `social_content_items`,
`social_media_batches`, `social_media_requests`); the second adds program terms,
onboarding and avoid-term columns; the third adds the client report link and
the `social_agreements` table; the fourth adds the logo links; the fifth adds client answers on pieces, client
notes and the media link. No existing data changes.

Like the rest of the office pages, changes are saved from production only.
Preview deployments show the pages read-only. Access is admin and coordinator.

## Changing the rules

Stages, content types, tier defaults, the post rotation and the media supply
rule live in `lib/social/schema.ts`. The database check constraints in the
migration list the same values, so a new stage or content type needs both.
