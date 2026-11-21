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

A sub-account can use a fixed monthly post count or selected weekdays. Switching
to weekly starts with Tuesday and Friday, which staff can change. Each selected
weekday in the service month counts once. For example, Tuesday and Friday give
eight posts in February 2027 and nine in July. A mid-month agreement starts its
first plan on or after the actual start date. Reels and Google posts keep their
monthly quantities. Planning creates drafts only and preserves existing pieces.

The contract term is counted in calendar months, including its starting month.
Changed quotas, program status and account activity take effect in the current
Eastern month. Closed months retain their recorded scope. For months before
scope history was introduced, quantities are reconstructed from saved plan slots
where they exist. The calendar follows each piece’s current publish date while
the piece counts toward its original production month.

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
  displayed revisions for one sub-account or day when the client uses batch approvals. Office-led clients follow progress and flag concerns while Oceano staff authorizes each saved revision.
- **Ask for a change**, with a note. A piece under review goes back to "In
  design". A piece that is already approved, scheduled or live stays where it
  is, and a failed check ("The client asked for a change") holds it from
  scheduling until the office resolves the concern and obtains fresh authorization. Earlier feedback stays in the piece history.
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

### The client guide

`public/guides/social-media-client-guide.pdf` is an eight page guide for
clients: reading the month, approving, asking for changes, sending notes and
media, privacy, and signing the agreement, with computer and phone screens.
It uses sample content only, so the same file is right for every client.

- A **Client guide** button sits at the top of every page of a client: in the
  header of the dashboard, and beside the tabs on the other pages.
- On a client's dashboard, the card "The client's page" has **Open the guide**
  and **Copy guide link**, to send along with the client's link.
- On the client's own page, "How this page works" has **Open the full guide (PDF)**.
- `/guides` is open without signing in. The file holds no client data.
- To replace the guide, put the new PDF at the same path. The PDF must hold no
  transparency (no soft shadows or see-through colors): some phone PDF viewers
  draw those as gray boxes.

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

## Approval and publishing

In **Terms and brand rules**, choose who approves posts. **Office** clients follow along and can ask for a change. Oceano Blue Media staff authorizes the saved piece from the board or the editor. **Individual** clients approve exact revisions. **Batch** clients may approve the specific pieces displayed for one property and day or month. Each decision preserves the caption, date, creative and destinations at the time. Changes to public copy, asset, schedule or destinations require fresh authorization. Open concerns must be handled first. Staff can edit private notes without invalidating sign-off.

### Clients who let us decide what to post

Some clients do not approve posts. Set **Who approves posts** to "We decide what to post" and nothing waits on them. On the production board each piece in **Our review** shows **Authorize** once it has a caption and a publish date and its checks pass, and **Authorize N ready** does every ready piece on screen in one step. Pieces with a failed check are skipped and stay where they are. An attached final image or video is optional for these clients. Clients who approve posts still need one, because that file is what they approve. The client's page tells them nothing needs their approval. They can still ask for a change on any piece, which holds it until the office handles the request.

### Posts scheduled by hand

**How posts get published** is "By hand" unless a publisher is connected. For those clients the office records what it did in the publishing tool: **Mark scheduled** on an authorized piece, then **Mark live** once it is up, with an optional link to the post. The board has the same two steps in bulk. **Mark N live** only counts pieces dated today or earlier. Both are refused when the piece changed after it was authorized, when the client has an open change request, or when a connected publisher has already claimed it. A mark made by mistake can be undone from the piece ("Not scheduled after all" or "Move it back"), which returns it to authorized. Every mark and undo is kept in the piece's history. Clients set to publish automatically never use these buttons; their pieces advance on receipts from the publisher.

In each account profile, confirm publishing access, enter the property's IANA timezone, and map each selected platform to its verified profile ID in the publishing provider. The account's public profile URL and Meta analytics connection serve different purposes. In the piece editor, set the local time and attach the exported creative. Each upload is copied into an immutable object in private storage. A reel requires a video. The client's page displays that exact copy. It loads it from `/api/social-public/creative/<piece>`, which needs the secret from the client's own link and only opens a file for a piece that client has already been shown. Staff pages use `/api/social/creative/<piece>`, which needs a sign-in.

### Make / external publisher contract (protocol 2)

The bridge at `/api/automations/social` requires the existing `x-pos-automation-secret` header. It is a handoff to an external worker such as Make. Provider authentication, an installed scenario and verified destination IDs are required for external delivery. A provider that cannot deduplicate sends or look up an uncertain attempt requires manual reconciliation.

1. **Discover.** `GET ?client=<uuid>&month=YYYY-MM` gives `candidates` containing item ID, revision and platform, plus `held` reasons. Each candidate also carries `publish_at` (the exact moment, in UTC), `due` (its time has come, within the last 24 hours) and `stale` (its time passed more than a day ago, so a person should decide). A worker that publishes at the moment, rather than scheduling ahead at the platform, claims only candidates with `due: true`. The older `program` parameter still works. The legacy `ready` list is empty to prevent old scenarios sending unclaimed copies.
2. **Test.** POST `{"action":"claim","client":"<uuid>","id":"<uuid>","month":"YYYY-MM","revision":1,"platform":"facebook","mode":"test"}`. A passing result contains `dispatch:false`, no media URL, no provider payload and no reservation. Test is the default.
3. **Claim just before sending.** The live worker requests `"mode":"live"`. It requires a production deployment with `SOCIAL_PUBLISHING_ENABLED=true` and live handoff enabled on this specific client. Ops rechecks active contract, format quota, exact authorized revision, content checks, connected account, current destination, frozen file, date and timezone. One worker receives a stable `idempotency_key`, per-attempt `claim_id`, `lease_until`, the UTC-offset publish timestamp, caption and a time-limited media URL. Use that exact key as the provider's deduplication key. If the lease runs out, reconcile with the provider before submitting again.
4. **Receipt.** POST `{"action":"receipt","idempotency_key":"<uuid>","claim_id":"<uuid>","event":"scheduled","provider_id":"<provider record>"}`. A later `published` receipt can include an HTTPS `published_url`. Repeated confirmations are idempotent. Each destination has independent state. A piece reaches Scheduled or Published after every intended destination confirms that stage.
5. **Reconcile.** On a timeout, post `event:"uncertain"` and `detail`. Look up the key or provider record before sending anything again. Use `failed` with a reason only for a definitive rejection or verified absence at the provider. Only that destination can then be claimed again. Retries retain the idempotency key and receive a fresh attempt ID. The piece editor shows receipts and feedback history. Earlier-revision receipts stay attached to their original revision.

Callbacks for the old whole-piece protocol return conflict. Callbacks for known deliveries still work when live handoff is disabled, so actual provider outcomes can be reconciled safely. Updating an already scheduled creative requires reconciliation at the publishing provider.

## Canva and creative files

Each property can link its Canva brand kit. Each piece can link its working design. Attach an exported image or video in the editor for approval and delivery. On the property page, staff can see where a creative was used this month and reuse it on another editable draft for the same property.

## Connect Facebook and Instagram for read-only verification

Set `SOCIAL_META_APP_ID` and `SOCIAL_META_APP_SECRET` in production and configure the existing `GOOGLE_TOKEN_ENCRYPTION_KEY`. Register the exact production callback `https://app.oceanoblue.net/api/social/connections/meta/callback` with the Meta app. The app must be approved for the requested permissions when connecting businesses outside its app roles.

An office user opens the property's Meta connections section and authorizes the Page and linked Instagram professional account. Ops matches the provider's profiles against the saved property links and shows the verification date. This flow requests `pages_show_list`, `pages_read_engagement` and `instagram_basic`. Grant publishing access and configure destination IDs separately in the client's publishing tool.

## Reporting by client

Set reporting responsibility under the client's Agreement tab. Progress is available per property. For client-managed analytics, the client uses their publishing tool for results. For agency-managed analytics, the office can attach the month's HTTPS report link and source. Supply a link intended for that client to open.

## Deployment

Apply the Social Studio migrations in filename order before deploying the application. The monthly scope migration records each account's current scope and recovers prior-month quantities only when there are saved plan entries for the month.

Keep `SOCIAL_PUBLISHING_ENABLED=false` during setup and internal testing. A production test claim checks a destination without reserving it or transmitting content. Before enabling a client for delivery, confirm provider authorization, mapped destination IDs, the property timezone, the publisher's deduplication behavior and its scheduled and published receipts.

Like the rest of the office pages, changes are saved from production only.
Preview deployments show the pages read-only. Access is admin and coordinator.

## Changing the rules

Stages, content types, tier defaults, the post rotation and the media supply
rule live in `lib/social/schema.ts`. The database check constraints in the
migration list the same values, so a new stage or content type needs both.
