import { requireTeamMember } from "@/lib/auth/require-team-member";
import { runBrief } from "@/lib/operations/runner";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST() {
  const gate = await requireTeamMember();
  if (gate.error) return gate.error;
  try {
    return Response.json(
      { run: await runBrief(gate.user.id, "manual") },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Briefing unavailable.",
      },
      { status: 503 },
    );
  }
}
