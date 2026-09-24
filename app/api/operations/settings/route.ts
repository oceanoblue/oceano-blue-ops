import { requireTeamMember } from "@/lib/auth/require-team-member";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/operations/settings";
import { listModels } from "@/lib/operations/providers";
export async function PUT(request: Request) {
  const gate = await requireTeamMember();
  if (gate.error) return gate.error;
  const parsed = settingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Check the time, timezone, and model selections." },
      { status: 400 },
    );
  try {
    const choices = Object.values(parsed.data.agents);
    for (const provider of ["openai", "anthropic"] as const) {
      const selected = choices.filter((c) => c.provider === provider);
      if (!selected.length) continue;
      const models = await listModels(provider);
      if (selected.some((c) => !models.some((m) => m.id === c.model)))
        return Response.json(
          {
            error: `Refresh the ${provider} model list and choose an available model.`,
          },
          { status: 400 },
        );
    }
    const db = await createClient();
    const result = await db
      .from("ops_agent_settings")
      .upsert({
        ...parsed.data,
        user_id: gate.user.id,
        updated_at: new Date().toISOString(),
      });
    if (result.error)
      return Response.json(
        {
          error:
            "Settings could not be saved. Check the operations database migration.",
        },
        { status: 503 },
      );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Provider verification failed.",
      },
      { status: 502 },
    );
  }
}
