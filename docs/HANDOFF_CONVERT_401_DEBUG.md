# Handoff: `/api/photos/convert` & `/api/photos/raw-preview` return 401 for an authenticated user

**Owner:** Gustavo (gustavo@oceanoblue.net) · **App:** Oceano Blue Production OS
**Status:** OPEN — blocking RAW (ARW/DNG) processing. JPEG path works fine.
**Last updated:** 2026‑06‑11

---

## 1. TL;DR

Two API routes — `POST /api/photos/convert` (RAW→JPEG) and `GET /api/photos/raw-preview`
(embedded‑JPEG bracket thumbnail) — return **HTTP 401 `{"error":"unauthorized"}`** for a
user who is logged in and whose other API calls succeed in the same session. This blocks
the ARW pipeline because conversion must happen before merge/enhance. The JPEG enhance
pipeline is fully working (verified: GPT Image 2.0 produced outputs).

The 401 comes from the standard Supabase auth gate (`getUser()` returns `null`), but
**only on these specific routes**. We have strong evidence it is **route/function‑specific,
not session‑wide**, and the leading theory is a **stale Vercel function build** and/or a
**cookie‑delivery problem to these specific lambdas**.

A workaround was just shipped (see §7): the logic was **re‑homed to brand‑new routes**
`POST /api/raw-convert` and `GET /api/raw-thumb` to escape any stale function. Test result
is the immediate next data point.

---

## 2. Stack / environment

| Thing | Value |
|---|---|
| Framework | Next.js **14.2.15**, App Router |
| Auth | `@supabase/ssr` **0.5.2**, `@supabase/supabase-js` **2.45.4**, cookie‑based SSR |
| Host | **Vercel Pro**, project `oceano-blue-ops`, team `gustavorattias-projects` (`team_zgVFpKpYcl6UMIqGDXMqQejC`) |
| Canonical domain | `oceano-blue-ops.vercel.app` |
| DB | Supabase project `hcxqqbnoextequclrvff` |
| RAW worker | Separate service on **Fly.io**, proxied by these routes (env `ARW_WORKER_URL`, `ARW_WORKER_SECRET`) |
| Build flags | `next.config.js` ignores TS/ESLint during build (142‑ish baseline tsc errors tolerated) |

### Auth pattern (identical in every protected route)
```ts
const supabase = createClient();              // lib/supabase/server.ts (reads cookies())
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
```
`middleware.ts` runs `getUser()` on every matched route and **redirects to `/login` (307)**
for non‑public unauthenticated requests. It never itself returns a 401 JSON. Public paths
are allow‑listed (`/api/worker`, `/api/automations`, `/api/cron`, `/api/delivery`, …);
`/api/photos/*` is NOT public (requires auth).

---

## 3. The symptom (precise)

- User is logged in; dashboard pages render; session is valid.
- Click **Convert to JPEG** on a RAW single → red badge **“unauthorized”**.
- Bracket thumbnails for ARW sets stay blank (the `raw-preview` 401, same root cause).
- Client code: `components/photos/PhotoManager.tsx` (convert, 2 call sites) and
  `components/photos/BracketCard.tsx` (preview). Both are plain same‑origin `fetch`,
  cookies included by default.

---

## 4. Evidence (what we measured)

1. **Same‑second, same‑session contradiction (the key fact):**
   In Vercel runtime logs, at the *same second*:
   - `GET /api/ai/status` → **200** (authenticated ✓)
   - `POST /api/photos/convert` → **401**
   Identical auth code, identical deployment, identical session. ⇒ **Not session‑wide.
   Specific to these routes.**

2. **Control route works:** `POST /api/photos/register` (same `getUser()` gate, also under
   `/api/photos/`, but **no** `maxDuration`) successfully registered uploads.

3. **Supabase Auth logs:** the failing requests **never reach GoTrue `/user`** (so `getUser`
   had no token to validate → the handler’s cookie store was effectively empty), while
   working requests hit `/user` → 200. (Searched the auth log dump; the only `/user` hits
   are 200; failing calls produce no `/user` request.)

4. **Strong `maxDuration` correlation (now doubted — see §6):** every failing route
   (`convert`, `raw-preview`, `adjust`, `re-photo/classify`) originally exported
   `export const maxDuration = …`. Every working route (`register`, `ai/status`,
   `ai/process`) did **not**.

5. **The decisive anomaly:** We deployed a change so `convert`’s 401 body becomes
   `"unauthorized [cookies:N sb:M]"`. Verified the new code is in `main` AND the production
   deployment is live. **The live response is still plain `"unauthorized"`.** Likewise a
   `console.error` diagnostic never appeared in Vercel logs. ⇒ Either the **deployed
   `convert` function is stale** (Vercel serving a cached build), or the **401 is generated
   upstream of the handler**.

---

## 5. Ruled out

- **Token expiry / bad session** — full sign‑out/sign‑in did NOT fix it; `ai/status` works
  in the same session; pages render (so middleware `getUser` succeeds).
- **`export const maxDuration`** — removed from the routes; still 401.
- **`vercel.json` `functions` config** — added, then removed entirely; still 401.
- **`next.config.js` rewrites/headers** — none exist.
- **Service worker** — none registered.
- **Catch‑all route interception** — no dynamic/catch‑all under `/api/photos`.
- **Middleware returning the 401** — middleware only 307‑redirects; it does not emit
  `{"error":"unauthorized"}`.

---

## 6. Leading hypotheses (open)

**H1 — Stale Vercel function build (most likely).** When these routes carried a custom
function config (`maxDuration` via route export, later via `vercel.json functions`), Vercel
may have built them as isolated lambdas. Removing the config did **not** cause those
specific functions to be rebuilt, so the old lambda (old code, old behavior) is still
served. This explains §4.5 (new code never appears in the live response). The original
`maxDuration`‑isolates‑the‑function theory may actually be correct — the fix just never
deployed onto that function.
→ **Test:** Vercel → Deployments → latest production → **Redeploy with “Use existing Build
Cache” UNCHECKED**. Or use the fresh routes from §7 (already done).

**H2 — Cookies not delivered to these specific functions.** If the handler truly runs but
`cookies()` is empty, `getUser()` returns null. Could be a Vercel platform/firewall/
deployment‑protection quirk scoped to certain functions, or a middleware→handler cookie
propagation gap that only bites these lambdas.
→ **Test:** read the cookie count the handler actually sees (see §8 diag route / fresh
convert’s 401 diagnostic).

---

## 7. What was just shipped (the workaround to evaluate first)

PR **#44** (merged, deployed to production, commit `ed6f6e25`, READY on canonical):

- New route **`POST /api/raw-convert`** (`app/api/raw-convert/route.ts`) — copy of convert,
  **no custom config**, and its **401 returns `"unauthorized [cookies:N sb:M]"`** so it is
  self‑verifying.
- New route **`GET /api/raw-thumb`** (`app/api/raw-thumb/route.ts`) — copy of raw‑preview.
- Client repointed: `PhotoManager.tsx` (convert ×2) → `/api/raw-convert`,
  `BracketCard.tsx` (preview) → `/api/raw-thumb`.

New paths = **new functions that cannot be stale**, and they live under `/api/` (like the
working `/api/ai/status`), which also rules out an `/api/photos`‑path issue.

**First action for whoever picks this up:** hard‑refresh the order page, click **Convert**,
and read the badge (hover it — it truncates):
- **Succeeds / spins then succeeds** → it was the stale function (H1). Done.
- **`worker_not_configured` (503) / `worker_unreachable` (502)** → **auth is fixed**; the
  remaining issue is the **Fly.io RAW worker** (down or env missing) — unrelated to auth.
- **`unauthorized [cookies:0 sb:0]`** → handler runs but gets **no cookies** (H2) → debug
  cookie delivery.
- **`unauthorized [cookies:N sb:M]` with N>0 + an error string** → cookies arrive, **token
  rejected** → token/refresh issue (the error string names it).

---

## 8. Diagnostics already in the repo

- **`GET /api/photos/diag`** (`app/api/photos/diag/route.ts`) — returns
  `{ authenticated, userEmail, totalCookies, sbCookieNames, authError }`. Open it directly
  in the browser **while logged in**:
  `https://oceano-blue-ops.vercel.app/api/photos/diag`
  (Note: this route’s production build was *skipped* by Vercel once — see §10 — but #44’s
  deploy should have carried it. If it 404s, it isn’t live yet.)
- **`/api/photos/convert`** 401 currently also returns the `[cookies:N sb:M]` diagnostic.

> These are temporary; remove once root cause is found.

---

## 9. Suggested next steps (in order)

1. **Read the result of #7** (Convert on the fresh route) — biggest signal.
2. **Open `/api/photos/diag` (and add an equivalent under `/api/`, e.g. `/api/raw-thumb`
   has no diag — add one)** to see `sbCookieNames` directly.
3. **Reproduce locally:** `next build && next start` (prod mode), log in, hit
   `/api/photos/convert`. If it works locally, the bug is **Vercel‑specific** (H1 stale
   function / platform), not the code.
4. **Force a clean rebuild:** Vercel Redeploy **without build cache** on production.
5. **Inspect the live function:** Vercel deployment → **Functions** tab — are `convert` /
   `raw-preview` separate lambdas? Compare to `register`/`ai-status`.
6. **Log the raw Cookie header** in the handler: `request.headers.get('cookie')?.length` and
   whether `sb-…-auth-token*` chunks are present. (Supabase chunks large JWTs into
   `sb-<ref>-auth-token.0/.1/…`.)
7. **Check Vercel Deployment Protection / Firewall** (dashboard → Settings → Deployment
   Protection; and the Firewall tab) for anything path‑scoped to `/api/photos`.
8. **Consider the `@supabase/ssr` 0.5.2 → latest upgrade** if H2 (cookie propagation) is
   confirmed; 0.5.x has known middleware/refresh edge cases.

---

## 10. Important operational gotchas

- **Vercel intermittently SKIPS the production build on merge to `main`.** Happened on
  PR #39 and PR #43 — the branch *preview* built, but no production deployment was created,
  so the canonical alias stayed on the previous commit. If a change “didn’t take,” verify
  the canonical deployment’s commit SHA before concluding anything. Forcing a fresh build
  (a real file/tree change, or a no‑cache redeploy) gets it across.
- **Vercel runtime log search is flaky** (frequent “query timed out before all pages were
  fetched”; object args of `console.error` weren’t reliably searchable). Don’t trust
  “no logs found” as proof of absence — prefer surfacing diagnostics **in the HTTP response
  body** (as the fresh convert route does).
- **Cannot deploy from the dev sandbox** — no Vercel CLI/token there; deploys happen via
  git push / PR merge auto‑build only.

---

## 11. Key files

| Path | Role |
|---|---|
| `middleware.ts` | Auth gate; 307→/login for unauth; public‑path allow‑list |
| `lib/supabase/server.ts` | `createClient()` (cookie reader), `createAdminClient()` |
| `app/api/photos/convert/route.ts` | **OLD** convert (stale‑suspected) |
| `app/api/photos/raw-preview/route.ts` | **OLD** preview |
| `app/api/raw-convert/route.ts` | **NEW** convert (fresh fn, self‑diagnosing 401) |
| `app/api/raw-thumb/route.ts` | **NEW** preview |
| `app/api/photos/diag/route.ts` | Browser‑openable cookie probe |
| `app/api/photos/register/route.ts` | Working control route (same auth, no maxDuration) |
| `app/api/ai/status/route.ts` | Working control route (returns 200) |
| `components/photos/PhotoManager.tsx` | Convert call sites (now → `/api/raw-convert`) |
| `components/photos/BracketCard.tsx` | Preview call site (now → `/api/raw-thumb`) |
| `vercel.json` | Crons only now (the `functions` block was removed) |

---

## 12. Background: how the RAW pipeline is meant to work

1. Upload RAW (ARW/DNG) → registered via `/api/photos/register` (works).
2. **Convert** each RAW → JPEG via `/api/raw-convert` → Fly.io worker `dcraw`/demosaic.
   (The worker also serves embedded‑JPEG previews via `/api/raw-thumb`.)
3. **HDR merge** brackets (deterministic, Oceano Enhance) → JPEG.
4. **AI Enhance** (GPT Image 2.0 default; Nano Banana 2/Pro selectable) → `/api/ai/process`
   enqueues `ai_jobs`; a 1‑minute cron + kick drains the queue; output to `processed-photos`.
5. **Review & Edit** → **Deliver**.

So **convert is the gate for the entire ARW path.** Until it authenticates (and the worker
is reachable), ARW shoots can’t be processed; JPEG uploads work end‑to‑end today.

---

## 13. One‑line summary for standup

> `/api/photos/convert` + `raw-preview` 401 a logged‑in user while sibling routes (`ai/status`,
> `register`) authenticate in the same session; deployed handler fixes never appear in the
> live response → almost certainly a **stale Vercel function build** (these routes once had a
> custom `maxDuration`). Workaround shipped: logic moved to fresh `/api/raw-convert` +
> `/api/raw-thumb`. Validate that first; if it 503/502s, it’s the Fly.io worker, not auth.
