import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { parseSettings } from "./settings";
import { loadSnapshot } from "./snapshot";
import { factualBrief, generateAgent } from "./providers";
import { AGENT_ROLES, type AgentOutput, type BriefRun } from "./types";
import { localClock, shouldRun } from "./time";

export async function runBrief(
  userId: string,
  mode: "scheduled" | "manual",
  now = new Date(),
) {
  const db = createAdminClient({ noStore: true });
  const member = await db
    .from("team_members")
    .select("is_active,role")
    .eq("id", userId)
    .maybeSingle();
  if (
    member.error ||
    !member.data?.is_active ||
    member.data.role === "photographer"
  )
    throw new Error("Office staff access is required.");
  const setting = await db
    .from("ops_agent_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (setting.error)
    throw new Error(
      "Agent settings are unavailable. Apply the operations migration.",
    );
  const settings = parseSettings(setting.data);
  if (mode === "scheduled" && !shouldRun(now, settings)) return null;
  const localDate = localClock(now, settings.timezone).date;
  // Atomic uniqueness also prevents double charges from concurrent cron calls.
  // Manual refresh is bounded to one attempt per 15-minute window per user.
  const key =
    mode === "scheduled"
      ? "daily"
      : `manual:${Math.floor(now.getTime() / 900000)}`;
  const claim = await db
    .from("ops_brief_runs")
    .insert({ user_id: userId, local_date: localDate, run_key: key })
    .select("*")
    .single();
  if (claim.error?.code === "23505") {
    const existing = await db
      .from("ops_brief_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("run_key", key)
      .single();
    if (existing.error)
      throw new Error("Could not read the existing briefing.");
    return existing.data as unknown as BriefRun;
  }
  if (claim.error || !claim.data)
    throw new Error("Could not reserve a briefing run.");
  try {
    const snapshot = await loadSnapshot(db, userId, settings.timezone, now);
    const outputs: AgentOutput[] = await Promise.all(
      AGENT_ROLES.map(async (role) => {
        const choice = settings.agents[role];
        try {
          return {
            role,
            ...choice,
            status: "completed" as const,
            ...(await generateAgent(role, choice, snapshot)),
          };
        } catch (error) {
          return {
            role,
            ...choice,
            status: "fallback" as const,
            text: factualBrief(role, snapshot),
            error:
              error instanceof Error ? error.message : "Agent unavailable.",
          };
        }
      }),
    );
    const status =
      outputs.some((o) => o.status === "fallback") ||
      snapshot.calendar.status !== "connected" ||
      snapshot.warnings.length
        ? "partial"
        : "completed";
    const save = await db
      .from("ops_brief_runs")
      .update({
        status,
        snapshot: snapshot as unknown as Json,
        outputs: outputs as unknown as Json,
        completed_at: new Date().toISOString(),
      })
      .eq("id", claim.data.id)
      .select("*")
      .single();
    if (save.error)
      throw new Error("The briefing ran but its result could not be saved.");
    return save.data as unknown as BriefRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Briefing failed.";
    const save = await db
      .from("ops_brief_runs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", claim.data.id)
      .select("*")
      .single();
    if (save.error)
      throw new Error("Briefing failed and could not be recorded.");
    return save.data as unknown as BriefRun;
  }
}
export async function runDailyBriefings(now = new Date()) {
  const db = createAdminClient({ noStore: true });
  // Crashed executions are visible and never replay paid requests silently.
  const reaped = await db
    .from("ops_brief_runs")
    .update({
      status: "failed",
      error: "Run interrupted. Refresh manually to try again.",
      completed_at: now.toISOString(),
    })
    .eq("status", "running")
    .lt("created_at", new Date(now.getTime() - 600000).toISOString());
  if (reaped.error) throw new Error("Could not check interrupted briefings.");
  const [settings, members] = await Promise.all([
    db.from("ops_agent_settings").select("*").eq("enabled", true),
    db
      .from("team_members")
      .select("id")
      .eq("is_active", true)
      .neq("role", "photographer"),
  ]);
  if (settings.error || members.error)
    throw new Error("Could not load daily schedules.");
  const active = new Set(members.data.map((m) => m.id));
  const due = settings.data.filter(
    (s) => active.has(s.user_id) && shouldRun(now, parseSettings(s)),
  );
  // Skip already-claimed users BEFORE batching so early users cannot starve others.
  const pending = [];
  for (const s of due) {
    const claimed = await db
      .from("ops_brief_runs")
      .select("id")
      .eq("user_id", s.user_id)
      .eq("local_date", localClock(now, s.timezone).date)
      .eq("run_key", "daily")
      .maybeSingle();
    if (claimed.error) throw new Error("Could not check briefing history.");
    if (!claimed.data) pending.push(s);
  }
  const results = await Promise.allSettled(
    pending.slice(0, 3).map((s) => runBrief(s.user_id, "scheduled", now)),
  );
  return {
    processed: results.length,
    remaining: Math.max(0, pending.length - 3),
    results: results.map((r) =>
      r.status === "fulfilled"
        ? { id: r.value?.id, status: r.value?.status }
        : { status: "failed" },
    ),
  };
}
