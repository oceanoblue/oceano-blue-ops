# Oceano Blue — Real Estate Photography Platform

A replacement for Fotello, built on Next.js 14 + Supabase + Vercel, with AI photo
processing wired up to OpenAI GPT Image and Google Gemini "Banana Pro".

## What's in here

**Internal team app** (`/dashboard`)
- Overview pipeline counts and recent activity
- Orders board with status pipeline, filters, and full order detail
- Weekly calendar view with photographer assignments
- Listings and clients directories
- Photo manager: drag-drop upload, EXIF-based HDR bracket detection,
  multi-provider AI processing, before/after grid, per-job cost & timing
- Delivery link generation, signed download zips, view/download counters
- Settings with team list and provider key instructions

**Public-facing** (no login required)
- `/` marketing landing page
- `/book` shoot-request form for real estate agents
- `/gallery/<token>` branded download gallery for clients

**AI processing pipeline**
- Provider abstraction with two implementations:
  - `openai-gpt-image` (gpt-image-1 via the `images.edit` endpoint)
  - `gemini-banana-pro` (Gemini 2.5 Flash Image / Banana Pro / Nano Banana)
- Real-estate-tuned prompts for HDR merge, single-shot enhance, sky replace,
  window pull, lawn enhance, declutter, twilight convert, virtual stage
- Sharp preprocessing (auto-rotate, downscale, JPEG re-encode) before each call
- Bracket detector reads EXIF timestamps, camera body, lens and exposure bias
- Job runner records cost, duration, provider, model, error per `ai_jobs` row

## Tech stack

- **Next.js 14** (App Router, Server Components, Route Handlers)
- **Supabase** for Postgres, Auth, Storage, RLS
- **Tailwind CSS** for styling
- **Sharp** for image processing
- **Archiver** for zip downloads
- **Zod** for input validation
- **Vercel** for hosting

## First-time setup

### 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project.
2. In the SQL Editor, run the four migrations in `supabase/migrations/` in order:
   - `0001_initial_schema.sql`
   - `0002_rls_policies.sql`
   - `0003_storage_buckets.sql`
   - `0004_seed_helpers.sql`
3. (Optional) Run `scripts/seed-demo.sql` to get some example data.

### 2. Create your first team member

In Supabase **Authentication → Users**, click "Add user", supply your Oceano Blue
email + password. Then open the SQL editor and run `scripts/seed-team-member.sql`
after editing the email and role.

You can now sign in at `/login`.

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

OPENAI_API_KEY=sk-...          # for GPT Image
GEMINI_API_KEY=...             # for Gemini / Banana Pro

NEXT_PUBLIC_APP_URL=http://localhost:3000
DELIVERY_LINK_SECRET=<random 32-byte string>
```

### 4. Run it

```bash
# IMPORTANT: there's a half-finished node_modules/ folder in this scaffold
# from an aborted sandbox install. Delete it first, then install cleanly.
rm -rf node_modules
npm install
npm run dev
```

Visit:
- `http://localhost:3000` — landing page
- `http://localhost:3000/book` — agent booking form
- `http://localhost:3000/login` — team sign-in → dashboard

### 5. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set the same env vars in **Vercel → Project → Settings → Environment Variables**.
Important: mark `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, and
`GEMINI_API_KEY` as **Production / Preview only** — never Development.

## Workflow walkthrough

1. **Agent books** at `/book` → creates a `clients` row (or matches existing),
   a `listings` row, and a `draft` `orders` row. Team is notified (TODO email).
2. **Coordinator opens** `/dashboard/orders`, accepts the order, assigns a
   photographer and shoot time. Status: `scheduled`.
3. **Photographer shoots**, then uploads JPEGs (or DNGs) on the order detail
   page. Order auto-transitions to `uploaded`.
4. **Editor opens** the photo manager, picks an AI job:
   - HDR brackets are auto-grouped by EXIF. One click runs every bracket
     through Banana Pro for HDR merge.
   - Non-HDR singles run through GPT Image or Banana Pro for retouching.
   - Specialty jobs (sky replace, window pull, declutter, twilight, virtual
     stage) are available on selected photos.
5. **Editor reviews** processed grid, deselects rejects (sets `is_selected = false`).
6. **Generate delivery link**. Status flips to `delivered`. Link is copied to
   clipboard, paste into the agent email.
7. **Agent opens** `/gallery/<token>`, browses, clicks "Download all" — a
   zip is streamed straight from Supabase Storage.

## What's intentionally still TODO

The skeleton is feature-complete enough to use, but the items below are common
extensions you'll likely want — flagged so they're not surprises:

- **Email notifications.** No transactional emails yet. Wire up Resend or
  Postmark and trigger from API routes on `draft → booked` and on link generation.
- **Background queue.** AI jobs run inline inside the `/api/ai/process` request
  (with up to 60s Vercel timeout). For big batches, swap to Inngest, Trigger.dev,
  or a Supabase Edge Function fired by `pg_cron`.
- **MLS sizing.** Add a Sharp step in the runner that produces `1024×683` MLS
  and `2048×1365` full-size variants into the `delivery` bucket. The gallery
  already supports an `is_selected` filter for which size to serve.
- **Invoicing / payments.** Order totals are tracked; Stripe Checkout integration
  is a natural next step.
- **Schedule blocks UI.** Schema is there (`schedule_blocks` table), no UI yet.
- **Map view.** `listings.lat/lng` columns exist; plug in Mapbox/Google when ready.
- **CSV / Lightroom export.** Optional, if any team member still wants a hybrid.
- **Generated TypeScript types from Supabase.** `lib/supabase/database.types.ts`
  is currently hand-written. Run `npm run db:types` after wiring the Supabase CLI
  to get the canonical version.

## File map

```
oceanoblue-platform/
├── app/
│   ├── api/                    # Route handlers (booking, upload, ai, delivery)
│   ├── book/                   # Public booking form
│   ├── dashboard/              # Internal team UI (auth-gated)
│   │   ├── orders/             # Pipeline + detail
│   │   ├── schedule/           # Weekly calendar
│   │   ├── listings/
│   │   ├── clients/
│   │   ├── photos/             # All AI jobs overview
│   │   └── settings/
│   ├── gallery/[token]/        # Client download page
│   ├── login/
│   ├── page.tsx                # Landing
│   └── layout.tsx
├── components/                 # UI building blocks (Sidebar, PhotoManager, etc)
├── lib/
│   ├── ai/                     # Provider abstraction + runner + prompts
│   │   ├── openai-gpt-image.ts
│   │   ├── gemini-banana-pro.ts
│   │   ├── bracket-detect.ts
│   │   └── runner.ts
│   ├── supabase/               # Browser + server clients + DB types
│   └── utils/                  # Formatting, classnames, tokens
├── supabase/migrations/        # 4 migration files
├── scripts/                    # Seed SQL
└── middleware.ts               # Auth guard
```

## Database migrations (production)

Live Supabase migrations are applied via a **manual** GitHub Actions workflow
(`.github/workflows/db-migrate.yml`) — never on push/PR, dry-run by default,
with a typed project-ref confirmation. Required secrets and step-by-step
instructions (trigger, verify `0015`–`0025`, confirm the `thumbnails` bucket and
new tables, and avoid the wrong project) are in
[`docs/DB_MIGRATIONS_RUNBOOK.md`](docs/DB_MIGRATIONS_RUNBOOK.md).

## Local Worker (local/NAS media)

A small read-only Node client (`worker-local/`) connects local/NAS folders to
Production OS: it scans folders, indexes media into `assets`, and generates
thumbnails — originals never leave the machine. Setup, env vars, scanning, and
troubleshooting are in [`docs/LOCAL_WORKER.md`](docs/LOCAL_WORKER.md).

## License

Private — Oceano Blue internal use.
