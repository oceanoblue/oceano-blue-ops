# Session Handoff — Oceano Blue Production OS (July 2026)

Owner: Gustavo (gustavo@oceanoblue.net). This doc lets any session — cowork,
Claude Code CLI, or a teammate — pick up exactly where we left off.

Live app: **https://oceano-blue-ops.vercel.app** (Vercel auto-deploys `main`).
Repo: `/Users/oceano/oceano-blue-ops/oceano-blue-ops` (GitHub oceanoblue/oceano-blue-ops).
DB: Supabase project **"Oceano Blue Ops"** (ref `hcxqqbnoextequclrvff`).

---

## 1. What shipped this session (all live in production)

1. **Landing page redesign** (`app/page.tsx`) — full page: nav, split hero with a
   command-center product mock, five-stage pipeline rail, capability cards, footer.
2. **Interim photo workflow v2** — in-platform AI editing (merge + enhance) is
   feature-flagged OFF (`business_settings.ai_editing_enabled`, default false)
   because it wasn't production-quality. Editing happens in **Fotello** (opens in
   its own window; embedding is impossible — bot-challenge + 3rd-party-cookie
   login). Office downloads originals zip, drops finished photos back →
   `kind='processed'` → normal review + delivery. Flip the flag to bring the AI
   tools back, no code change. (`docs/WORKFLOW_FOTELLO_EDIT_LOOP.md`)
3. **Contractor photographer portal** (`/field`) — see §3. Migrations 0053 + 0054.
4. **Contractor assignment email** — "Email upload link" on the order page sends a
   branded Resend email with the Dropbox upload link. Blocked on domain verification
   (§4). Code: `lib/email/*`, `app/api/orders/[id]/notify-contractor`.
5. **Client Media Room** — the portal now shows video / 360 tours / floor plans, not
   just photos. Migration 0055. See §3.

Key commits: `be97170` (landing), `2e70091` (workflow v2), `965a76d`/removed (Fotello
v1), `cdaef1a`+`1048d44` (contractor portal), `fe0f3f6`/`d8c2c48` (email),
`ed86d32` (Media Room).

---

## 2. Architecture facts you must know before editing

- **Two external user types, both magic-link, both isolated by RLS** (never
  `team_members`, so `is_team_member()` is false for them → zero office access):
  - **Clients** → `/portal`, scoped by `current_client_id()` (migration 0005).
  - **Contractors** → `/field`, scoped by `current_contractor_id()` (0053).
  - All their WRITES go through `SECURITY DEFINER` RPCs that re-derive identity
    server-side. Copy this pattern for any new external surface.
- **Office** (`/dashboard`) = `team_members` (roles admin/coordinator/photographer/
  editor), full access via `is_team_member()`.
- **Deploy gate**: the local Mac's build/test toolchain is BROKEN (EPERM writing
  `.next`; corrupted outer `node_modules`/esbuild from a failed `npm install`).
  `npx tsc --noEmit --incremental false` WORKS and is the local check. **Vercel CI
  is the real build gate** — a failed build there does not promote, so the live site
  is safe. Do NOT trust a "no local build" as unverified; trust tsc + Vercel.
- **Always `git fetch` + fast-forward before editing** — cloud Claude sessions push
  to `main` directly; the local checkout has been 100+ commits behind before.
- **Production migrations need explicit owner approval** (the safety classifier
  blocks unnamed ones). Apply via the Supabase MCP `apply_migration`, then run
  `get_advisors` (security) to confirm RLS is intact.
- Git identity on this Mac is auto-generated (`oceano@Rattias-MacBook-Pro.local`).
  Optional: `git config --global user.email gustavo@oceanoblue.net`.

---

## 3. Feature detail

### Contractor portal (`/field`) — migrations 0053, 0054
- `contractors` table (external; `pay_rate_cents` = flat rate per property).
- `orders` gained `contractor_id`, `source` ('office'|'field'), `pay_status`, `pay_amount_cents`.
- Contractor flow: sign in → log a shoot (address autocomplete + sqft + services) →
  get Dropbox upload folder → "I've uploaded" → status `uploaded`.
- Field shoots attach to a singleton **"Field Intake"** placeholder client
  (`field-intake@oceanoblue.internal`) because `orders.client_id` is NOT NULL —
  office reassigns the real client later.
- Office: **Dashboard → Photographers** roster (per-photographer counts, owed =
  flat rate × completed-unpaid, rate edit, Mark-paid). Assign a contractor + "Email
  upload link" on the order page (right sidebar → Schedule + team).

### Client Media Room — migration 0055
- `listing_deliverables` table: kind `video|tour_360|floor_plan|other`, each is a
  `url` (Matterport/YouTube/Vimeo) OR a `file` in the private **`deliverables`**
  bucket (5 GB; video+pdf+images). RLS: client reads only `is_published` items for
  their own listings.
- Office: "Video, tours & floor plans" panel on the order page (add by link/upload,
  publish toggle, delete).
- Client: `MediaRoom` on `/portal/listings/[id]` renders below photos — embeds via
  `lib/deliverables/embed.ts`; uploaded files signed via admin after the RLS check.

---

## 4. Integrations & env (Vercel env vars)

- **Dropbox** — WORKING. Business team app (ID 8615889); needed `files.content.write`
  + `file_requests.write` scopes + a fresh refresh token. `dbxUserCall()` handles the
  team token via `Dropbox-API-Select-User`. Contractor RAW folders under `/Photo Intake`.
- **Resend email** — key added ("OPS" key). **BLOCKED**: oceanoblue.net can't verify
  because DNS is on **Wix**, which doesn't allow subdomain MX (Resend needs MX on
  `send.oceanoblue.net`). DKIM verified, SPF failed. Interim: set
  `EMAIL_FROM=onboarding@resend.dev` (Resend shared domain — only sends to the Resend
  account email). Reply-to defaults to `info@oceanoblue.net`.
- Supabase, OpenAI/Gemini (unused while AI editing off), Make.com podcast bridge — as before.

---

## 5. OPEN NEXT STEPS (priority order)

1. **Move oceanoblue.net DNS to Cloudflare** — unblocks BOTH:
   (a) Resend branded email (contractor + future client-delivery/invoice emails), and
   (b) a **custom app domain** (e.g. `app.oceanoblue.net`) instead of the vercel.app URL.
   FIRST inventory every current Wix DNS record (Wix website + `info@` email MX/SPF/
   DKIM + any others) and recreate in Cloudflare BEFORE switching nameservers so
   nothing goes down. Then add Resend records + Vercel domain. After: set
   `EMAIL_FROM=noreply@oceanoblue.net`.
2. **Custom domain in Vercel** — Project → Settings → Domains → add the subdomain;
   Vercel gives a CNAME target. Also update `NEXT_PUBLIC_APP_URL` to the new domain
   (portal links in emails use it).
3. **Repair the local build toolchain** — clean reinstall of `node_modules` (the
   outer `/Users/oceano/oceano-blue-ops/node_modules` esbuild is corrupted; the inner
   repo needs a fresh `npm install`), and investigate the `.next` EPERM (macOS
   file-protection / leftover root-owned files). Until fixed, tsc + Vercel is the gate.
4. **Test the live flows end-to-end** (couldn't locally): a real contractor logging +
   uploading a shoot; a real client viewing a Matterport tour / video / floor plan.

---

## 5b. DNS → Cloudflare migration — IN PROGRESS (verified inventory)

Started moving oceanoblue.net DNS to Cloudflare (account: info@oceanoblue.net,
free plan). Zone `oceanoblue.net` is CREATED in Cloudflare but **nameservers are
still Wix (ns6/ns7.wixdns.net) — NOT yet flipped, nothing is live**.

**Cloudflare assigned nameservers (set these at Wix to go live):**
`bjorn.ns.cloudflare.com` + `marjory.ns.cloudflare.com`

**CRITICAL LESSON: Cloudflare's auto-scan MISSED custom subdomains.** The real
zone runs FOUR live services. The authoritative record set (read from Wix
"Manage DNS Records", values confirmed via DoH):

- **A** `@` → 198.202.211.1  (Webflow site) — in CF ✓, DNS only
- **CNAME** (all must be **DNS only / grey cloud**):
  - `www` → cdn.webflow.com — CF ✓
  - `immersive` → 415b89a24be4ce77.vercel-dns-017.com (Vercel) — CF ✓ (added manually)
  - `homes` → beb3de23065d0799.vercel-dns-016.com (Vercel) — **NOT in CF yet**
  - `s1._domainkey.homes` → s1.domainkey.u54997439.wl190.sendgrid.net — **NOT in CF yet**
  - `s2._domainkey.homes` → s2.domainkey.u54997439.wl190.sendgrid.net — **NOT in CF yet**
  - `em6474.homes` → u54997439.wl190.sendgrid.net (SendGrid) — **NOT in CF yet**
- **MX** `@` → Google Workspace: aspmx.l.google.com(10), alt1(20), alt2(30), alt3(40), alt4(50) — CF ✓
- **TXT** (all in CF ✓):
  - `@` apple-domain-verification=XEC5wJsvpPYke8d0UITr-Hd6MikXCQOjctXE836CtMU
  - `@` v=spf1 include:_spf.google.com ~all
  - `@` google-site-verification=AswKroT3_I3qh36HAEfSWZjJpK3Z8Rs40Ow_zeuf14s
  - `resend._domainkey` p=MIGf… (Resend DKIM)
  - `_vercel` vc-domain-verify=… (immersive)
  - `_webflow` one-time-verification=2f64…
  - `send` v=spf1 include:amazonses.com ~all (Resend SPF)

**Remaining to make the zone a complete mirror (add in Cloudflare, all DNS only):**
1. The 4 `homes.*` CNAMEs above (preserves the homes site + its SendGrid email).
2. **`send` MX → feedback-smtp.us-east-1.amazonses.com priority 10** — the Resend
   return-path Wix couldn't do; this is the actual email fix. (Verify exact host in
   the Resend dashboard's SPF section before adding.)

**Then, and only after the zone is verified complete:**
3. Flip nameservers at Wix: Wix account → Domains → oceanoblue.net ⋯ → (external
   nameservers flow) → replace ns6/ns7.wixdns.net with the two Cloudflare NS.
   NOTE: Wix's ⋯ menu showed Manage DNS records / Transfer away / Edit MX — the
   external-nameserver switch may be inside "Manage DNS records" or need Wix support;
   confirm Wix allows external nameservers on this plan (some don't).
4. After propagation (~15–60 min): verify Resend domain; add `app.oceanoblue.net`
   in Vercel (oceano-blue-ops project) → add the Vercel CNAME target in Cloudflare
   (DNS only); set Vercel env `EMAIL_FROM=Oceano Blue <noreply@oceanoblue.net>` and
   `NEXT_PUBLIC_APP_URL=https://app.oceanoblue.net`; redeploy.

App domain chosen: **app.oceanoblue.net**.

## 6. Controlling Chrome / dashboards from a session

Gustavo's real Chrome IS reachable via the `claude-in-chrome` MCP (Browser 1, macOS,
connected). A session with that MCP can drive his logged-in Vercel / Cloudflare / Wix
dashboards WITH his approval per step — so the DNS + domain move can be done from a
normal session; cowork is not required. (Account actions still need his credentials/
2FA in the browser; Claude drives, he authenticates.)
