/**
 * Make.com API integration (Phase C) — auto-provision the per-client publish
 * Router branch from POS so onboarding a show doesn't need manual scenario edits.
 *
 * Safety model (matches the owner's "guided auto-setup" choice):
 *   - Read-only listing of YouTube connections for the picker.
 *   - The branch append is APPEND-ONLY (never edits/removes existing routes),
 *     idempotent (skips if a route for the slug already exists), and only runs
 *     when the operator clicks. A failed call writes nothing.
 *
 * Env (owner-set in Vercel; degrades gracefully when missing):
 *   MAKE_API_TOKEN (required), MAKE_ZONE (default us2.make.com),
 *   MAKE_TEAM_ID (default 2268037), MAKE_PUBLISH_SCENARIO_ID (default 5341624).
 */

const ZONE = process.env.MAKE_ZONE || 'us2.make.com';
const TEAM_ID = process.env.MAKE_TEAM_ID || '2268037';
const PUBLISH_SCENARIO_ID = process.env.MAKE_PUBLISH_SCENARIO_ID || '5341624';

export function isMakeConfigured(): boolean {
  return Boolean(process.env.MAKE_API_TOKEN);
}

function authHeaders() {
  return { Authorization: `Token ${process.env.MAKE_API_TOKEN}`, 'Content-Type': 'application/json' };
}

export type MakeConnection = { id: number; label: string };

export async function listYoutubeConnections(): Promise<MakeConnection[] | null> {
  if (!isMakeConfigured()) return null;
  const res = await fetch(`https://${ZONE}/api/v2/connections?teamId=${TEAM_ID}&type[]=youtube`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`make_connections_${res.status}`);
  const json = (await res.json()) as { connections?: any[] };
  return (json.connections ?? []).map((c) => ({
    id: c.id,
    label: c.metadata?.value || c.name || `Connection ${c.id}`,
  }));
}

type AnyModule = Record<string, any>;

/** All numeric module ids anywhere in a flow (incl. nested router routes / onerror). */
function collectIds(flow: AnyModule[], acc: number[] = []): number[] {
  for (const m of flow) {
    if (typeof m.id === 'number') acc.push(m.id);
    for (const r of m.routes ?? []) collectIds(r.flow ?? [], acc);
    if (m.onerror) collectIds(m.onerror, acc);
  }
  return acc;
}

/** Reassign ids in a cloned subtree starting at `next`, returning the new next. */
function renumber(flow: AnyModule[], next: { v: number }): void {
  for (const m of flow) {
    m.id = next.v++;
    for (const r of m.routes ?? []) renumber(r.flow ?? [], next);
    if (m.onerror) renumber(m.onerror, next);
  }
}

async function getBlueprint(scenarioId: string): Promise<AnyModule> {
  const res = await fetch(`https://${ZONE}/api/v2/scenarios/${scenarioId}/blueprint`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`make_get_blueprint_${res.status}`);
  const json = (await res.json()) as any;
  const bp = json?.response?.blueprint ?? json?.blueprint ?? json;
  if (!bp?.flow) throw new Error('make_blueprint_shape');
  return bp;
}

async function patchBlueprint(scenarioId: string, blueprint: AnyModule): Promise<void> {
  const res = await fetch(`https://${ZONE}/api/v2/scenarios/${scenarioId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ blueprint: JSON.stringify(blueprint) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`make_patch_${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
}

export type ProvisionResult =
  | { status: 'created' }
  | { status: 'exists' }
  | { status: 'not_configured' }
  | { status: 'no_router' }
  | { status: 'failed'; error: string };

/**
 * Append a publish-Router branch for `slug` bound to `connectionId` in the
 * publish scenario. Clones the first existing route (so the callback URL +
 * secret header carry over verbatim) and only swaps the YouTube connection and
 * the show_slug filter. Idempotent + append-only.
 */
export async function provisionPublishRoute(slug: string, connectionId: number): Promise<ProvisionResult> {
  if (!isMakeConfigured()) return { status: 'not_configured' };
  try {
    const bp = await getBlueprint(PUBLISH_SCENARIO_ID);
    const router = (bp.flow as AnyModule[]).find((m) => m.module === 'builtin:BasicRouter');
    if (!router || !Array.isArray(router.routes) || router.routes.length === 0) return { status: 'no_router' };

    // Idempotency: a route whose first module filters on this slug already exists?
    const already = router.routes.some((r: AnyModule) =>
      (r.flow ?? []).some((m: AnyModule) =>
        (m.filter?.conditions ?? []).some((grp: AnyModule[]) =>
          grp.some((c) => c?.a === 'show_slug' && c?.b === slug)
        )
      )
    );
    if (already) return { status: 'exists' };

    const template = JSON.parse(JSON.stringify(router.routes[0])) as AnyModule;
    const next = { v: Math.max(0, ...collectIds(bp.flow as AnyModule[])) + 1 };
    renumber(template.flow ?? [], next);

    const yt = (template.flow ?? []).find((m: AnyModule) => m.module === 'youtube:updateVideo');
    if (!yt) return { status: 'failed', error: 'template_missing_youtube' };
    yt.parameters = { ...(yt.parameters ?? {}), __IMTCONN__: connectionId };
    yt.filter = { name: slug, conditions: [[{ a: 'show_slug', b: slug, o: 'text:equal' }]] };
    if (yt.metadata?.designer) yt.metadata.designer.y = (yt.metadata.designer.y ?? 0) + 200 * router.routes.length;

    router.routes.push(template);
    await patchBlueprint(PUBLISH_SCENARIO_ID, bp);
    return { status: 'created' };
  } catch (e: any) {
    return { status: 'failed', error: e?.message ?? 'make_error' };
  }
}
