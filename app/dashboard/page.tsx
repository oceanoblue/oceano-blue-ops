import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadSnapshot } from "@/lib/operations/snapshot";
import { parseSettings } from "@/lib/operations/settings";
import { providerConfigured } from "@/lib/operations/providers";
import type { BriefRun, OperationsSnapshot } from "@/lib/operations/types";
import { DailyOperations } from "@/components/operations/DailyOperations";
export const dynamic = "force-dynamic";
export default async function DashboardHome() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");
  const member = await db
    .from("team_members")
    .select("full_name,is_active,role")
    .eq("id", user.id)
    .maybeSingle();
  if (!member.data?.is_active || member.data.role === "photographer")
    redirect("/");
  const [saved, history] = await Promise.all([
    db
      .from("ops_agent_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    db
      .from("ops_brief_runs")
      .select(
        "id,local_date,run_key,status,outputs,error,created_at,completed_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(7),
  ]);
  const settings = parseSettings(saved.data);
  let snapshot: OperationsSnapshot | null = null;
  let error: string | null = null;
  try {
    snapshot = await loadSnapshot(db, user.id, settings.timezone);
  } catch (e) {
    error = e instanceof Error ? e.message : "Operations data is unavailable.";
  }
  return (
    <DailyOperations
      name={member.data.full_name?.split(" ")[0] || "team"}
      snapshot={snapshot}
      loadError={error}
      settings={settings}
      settingsAvailable={!saved.error && !history.error}
      scheduleSaved={!!saved.data}
      runs={(history.data ?? []) as unknown as BriefRun[]}
      providers={{
        openai: providerConfigured("openai"),
        anthropic: providerConfigured("anthropic"),
      }}
    />
  );
}
