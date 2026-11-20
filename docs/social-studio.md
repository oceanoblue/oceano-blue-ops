# Social Studio

`/dashboard/social` is where Oceano Blue Media runs social media programs for
clients: who the accounts are, what each one is owed every month, where every
piece of content is in production, and whether we have enough media to keep
going. It is built for programs with many accounts, such as a hotel group.

Social onboarding (`/social/start`, see `social-onboarding.md`) collects a new
client's answers and files. Social Studio is what happens after that.

## How it is organized

- **Program**: one client engagement. It has a contact, a status and the name
  of the tool posts are published from.
- **Account**: one property or brand inside a program. It holds the monthly
  quota (posts, reels, Google posts), the platforms it is on with a link to
  each profile, the Canva brand kit link, the media folder link, voice and
  style notes, and whether we have access.
- **Piece**: one post, reel or Google post for an account in a month. It has a
  content type, a working title, a caption, a publish date, an assignee, a
  Canva design link, review notes and a stage.
- **Media batch**: a note that photos or clips arrived for an account.
- **Media request**: something we have asked the client to send.

## The three views

- **Overview**: the month at a glance. Totals, what needs attention (accounts
  short on media, accounts not connected, open requests), and a progress bar
  for every account. "Plan the month" and "Add accounts" live here.
- **Production board**: the month's pieces in columns by stage. Open a card to
  edit it, or move it to the next stage with one click.
- **Calendar**: the same pieces by publish date. Late pieces are outlined.

Stages, in order: Planned, Needs media, In design, Our review, Client review,
Approved, Scheduled, Published. A piece counts as done for the month once it is
Scheduled or Published.

## Planning a month

"Plan the month" creates every piece each active account is owed, with a
content type and a suggested date spread across the month. Posts rotate through
property feature, local event, property feature, local story, flexible, so five
posts give the 2-1-1-1 mix. It only adds what is missing: running it again, or
after adding accounts or raising a quota, never duplicates or resets work.

## Adding accounts

Paste one account per line and pick the type. A line can include the account's
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

Program details hold what the client bought: monthly fee, the rate for an
account added or removed, a minimum monthly fee, term start and length, the day
of the month media is due, a link to the signed agreement, and terms to avoid.
These are records for the office; nothing is invoiced from them.

The onboarding checklist is the same twelve steps for every program, from
"Agreement signed" to "Monthly report set up". Ticking a step records the date.

## Drafting captions with AI

"Draft with AI" in the editor writes a first draft from the working title and
the account's voice notes, using the model chosen in Operations settings. It is
told to use only the facts it is given and to leave a `[placeholder]` for
anything it does not know, which the checks then flag until someone fills it
in. The draft goes into the editor only; nothing is saved until Save.

## Make bridge

`/api/automations/social` lets a Make scenario schedule approved content. It
uses the same `x-pos-automation-secret` header as the podcast bridge.

- `GET ?program=<program id>&month=YYYY-MM` returns `ready` (approved pieces
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

Apply `20261118130000_social_studio.sql` and then
`20261120160000_social_studio_programs.sql` before deploying the code. The first adds five
tables (`social_programs`, `social_accounts`, `social_content_items`,
`social_media_batches`, `social_media_requests`); the second adds program terms,
onboarding and avoid-term columns. No existing data changes.

Like the rest of the office pages, changes are saved from production only.
Preview deployments show the pages read-only. Access is admin and coordinator.

## Changing the rules

Stages, content types, tier defaults, the post rotation and the media supply
rule live in `lib/social/schema.ts`. The database check constraints in the
migration list the same values, so a new stage or content type needs both.
