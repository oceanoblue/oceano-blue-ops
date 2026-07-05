---
name: handoff
description: Write the end-of-session handoff doc. Use when a session is wrapping up, when the user says "handoff", "write up where we are", or before context runs out on a large task. Produces docs/HANDOFF-<topic>.md containing ONLY session-specific state — stable facts live in CLAUDE.md and must not be duplicated here.
---

# End-of-session handoff

Historically every handoff re-explained the deploy matrix, sandbox limits,
Supabase ritual, and conventions — 10 docs with heavy duplication, some of it
now stale and misleading. Those facts live in `CLAUDE.md`. A handoff contains
only what this session changed or learned.

## Steps

1. Pick a topic slug; write to `docs/HANDOFF-<topic>.md`. If continuing a prior
   handoff on the same topic, update that file instead of creating a sibling.
2. Fill exactly these sections:

```markdown
# HANDOFF: <topic> — <date>

## Shipped (merged + verified)
<PR numbers, one line each, what was confirmed working and how>

## Shipped but UNVERIFIED
<anything merged that has not been confirmed against a real render / live
deploy / real data. Be explicit about what verification is missing. If this
list has more than one grade/tuning entry, flag it — unverified versions must
not stack (see CLAUDE.md, grade tuning rules).>

## Owner must run
<exact commands/actions the sandbox could not perform: fly deploy + health
curl, office-Mac git pull, test-photo render, branch deletion, secret
rotation. Copy-pasteable.>

## Open decisions
<decisions deferred to the user, with the options and your recommendation.
If a previous handoff carried the same open decision, link it and say whether
it is still open or was resolved (and where).>

## New gotchas learned
<anything a future session would otherwise rediscover. If it is a STABLE fact
(platform behavior, deploy trap, convention), add it to CLAUDE.md in this same
PR instead of only listing it here.>
```

3. Do NOT include: stack description, deploy matrix, env-var registries,
   Supabase project info, conventions, migration numbering. All in CLAUDE.md.
4. If this session made any older handoff stale (resolved its open decision,
   superseded its design), add a one-line banner to the top of that old doc:
   `> Historical — superseded by <file/PR> on <date>.`
5. Commit the handoff in the session's final PR.
