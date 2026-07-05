# Claude Code Session Friction Audit

Date: 2026-07-05. Method: four parallel sub-agent analyses over (1) the 10
`docs/` handoff/postmortem files, (2) full git history — 404 commits,
2026-05-18 → 2026-07-02, 40 `claude/*` branches, (3) all 151 GitHub PRs + 220
Actions runs, (4) repo configuration.

Headline numbers: 151 PRs in ~3.5 weeks, 149 merged, median time-to-merge
**2.4 minutes** (all self-merged — validation happened in production, not in
review). fix:feat ratio 47:66. Zero abandoned Claude branches — the waste is
not orphaned work, it is **serial re-fixing**: the same problem consuming 2–8
sessions each.

---

## Friction clusters (ranked by cost)

### 1. Perceptual tuning without a reference harness — the single biggest burn
The "make interiors look like AutoHDR/Fotello" problem was solved **three
times**, once per engine generation (TS pipeline June 14–21, Python edit-engine
June 22–23, worker-edit sober-grade June 25–July 1), ~20 grade commits total.
White balance alone was re-fixed in #70, #127, and #134. The v1→v6 loop ran six
versions in seven days (v3→v6 all on July 1); v5 and v6 were handed off
**unverified**. Every iteration required: merge → owner fly-deploys → owner runs
a test photo → owner describes the result in words ("dark/muddy", "sepia
bloom"). Convergence began exactly when a commit first validated against a real
render (`8080b9b`), and the v6 review concluded the loop was structural: the
8-bit pipeline made "expose the room" and "hold the windows" fight over the
same bits. Tests arrived at v6; they would have caught v3 and v5 pre-deploy.

### 2. Deploy-target blindness — "the fix didn't take"
Three deploy targets, three failure modes, ~12 PRs:
- **Vercel**: the CONVERT-401 saga (#36–#45, ~10 PRs over two days, 52 commits
  on June 11 alone). Root causes: `maxDuration` route export nuking cookies,
  middleware redirecting the cookie-less cron worker, and **stale Vercel
  functions** serving frozen 401s while Vercel silently skipped prod builds on
  two merges. Two diagnostic-only PRs shipped to prod because logs were
  unreliable.
- **Fly**: worker-edit Dockerfile `COPY server.py .` missed the new P1–P4
  modules → prod crash-looped on ModuleNotFoundError for ~a day (`fbb6518`).
  Deploy-by-empty-commit appears 5× in history.
- **Office Mac**: worker-local/worker-resolve need a manual `git pull`,
  re-documented in every handoff.

### 3. Fixes that didn't reproduce the failure first
OOM "fixed" in #147 (bounded the wrong side of fusion) then actually fixed in
#148 the next day; loupe click fixed twice in 24h (#112, #114); duplicate RAW
conversions deduped twice (#82, #84); middleware blocking its own APIs twice,
three days apart. Pattern: the first fix was plausible reasoning, not a
reproduced failure.

### 4. Context re-acquisition tax — handoff docs as a manual CLAUDE.md
No CLAUDE.md existed. Ten handoff docs re-state the same stable facts: the
deploy matrix (3 docs), sandbox limits (5 docs), the tsc baseline (5 docs — and
it's **stale**: strict typing was restored in #63), conventions cheat-sheet (4
docs), the migration counter maintained by hand in prose (3 docs), env-var
registries rewritten per doc. Three PRs (#140, #145, #151) exist purely to
persist context; `docs/HANDOFF-photo-quality.md` churned 8 times on main —
as much as product code. 43 of 151 PRs shipped from one fallback-named branch
(`claude/session-description-unavailable-mQlWl`), destroying session
traceability.

### 5. Config drift and doc rot
README says "four migrations" (there are 50) and omits three of the four
workers; `.env.example` documents ~14 of ~44 env vars the code reads
(missing `CRON_SECRET`, `EDIT_ENGINE_URL`, `ARW_WORKER_URL`, all Dropbox/Make/
Transistor vars, and every tuning knob); no `supabase/config.toml`, so
`db:reset`/`db:types` scripts silently don't work; no CI for `worker/`,
`worker-local/`, or `worker-resolve/`; no eslint config while CI runs lint
(continue-on-error).

### 6. What is NOT friction (don't spend effort here)
GitHub Actions: 190 CI runs, **zero failures**. Abandoned work: only 2 unmerged
PRs, both early and cleanly closed. Review threads: none — friction lives in
deploy-debug loops, not discussion.

---

## Fixes shipped in this PR

1. **`CLAUDE.md`** (new) — the stable-facts file that clusters 2, 4, and 5 keep
   paying for: verify-loop commands, four-worker system map, deploy matrix,
   sandbox limits, Supabase ritual, platform gotchas, grade-tuning rules,
   standing rules. This alone should shrink future handoffs to genuinely
   session-specific state.
2. **`.claude/skills/handoff`** — generates end-of-session handoffs from a fixed
   template covering ONLY session state (shipped / unverified / owner-must-run /
   open decisions), pointing at CLAUDE.md for everything stable.
3. **`.claude/skills/deploy-worker-edit`** — the worker-edit ship checklist:
   Dockerfile COPY audit against imports, pytest, deploy command, health-check
   verification (`"raw":true`), owner hand-off lines.
4. **`.claude/skills/grade-tune`** — encodes the tuning discipline: reproduce →
   one change → pytest invariants → real-render confirmation before the next
   round; never stack unverified versions.

## Proposed automations (not implemented — pick and ask for them)

Ranked by expected friction removed:

1. **Golden-render regression harness** (kills cluster 1): check a small set of
   real bracket sets + current-best renders into `worker-edit/golden/`; a pytest
   that renders them and asserts objective bounds (mean luminance, % clipped
   highlights, halo metric at window edges, ΔE vs golden within tolerance).
   Grade PRs then show measurable diffs instead of adjectives, and CI catches a
   v3-style window blowout before deploy.
2. **worker-edit Docker smoke test in CI** (kills the Dockerfile COPY class):
   `docker build` + boot the image + hit `/health` in the existing
   `edit-engine` CI job. ~10 lines of YAML; would have saved a day of prod
   crash-loop.
3. **Fly auto-deploy on merge** for `worker-edit/` (path-filtered GitHub Action
   using `flyctl deploy --remote-only` with a `FLY_API_TOKEN` secret), gated on
   the smoke test — removes the manual deploy ritual AND the "sandbox can't
   reach fly.dev" verification gap.
4. **Deploy-verification step**: tiny post-merge Action (or `/verify-deploy`
   skill) that polls the Vercel deployment for the merge SHA and curls the Fly
   health endpoints — turns "Vercel silently skipped the build" from a
   multi-day mystery into a red check.
5. **Env-var drift check in CI**: script that greps `process.env.X` /
   `os.environ` across app+workers and fails if a var is missing from
   `.env.example` — stops cluster 5 from regrowing.
6. **Wire the remaining tests into CI**: `worker-resolve/test_cutplan.py` and a
   basic test job for `worker/` and `worker-local/` (both currently have zero
   CI).

## Proposed doc fixes (cheap, high value)

- Refresh `README.md`: 50 migrations, all four workers, CI/typecheck/test
  section, current file map (or just point at CLAUDE.md).
- Regenerate `.env.example` from the drift-check script's output, grouped by
  service.
- Mark superseded handoff docs as historical (one-line banner) so future
  sessions don't ingest the stale "142-error baseline" or the resolved
  RAW-ingest open decision as current truth.
