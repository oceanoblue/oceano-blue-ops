import { requireTeamMember } from "@/lib/auth/require-team-member";
import { listModels, providerConfigured } from "@/lib/operations/providers";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const gate = await requireTeamMember();
  if (gate.error) return gate.error;
  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== "openai" && provider !== "anthropic")
    return Response.json(
      { error: "Choose OpenAI or Anthropic." },
      { status: 400 },
    );
  if (!providerConfigured(provider))
    return Response.json(
      {
        error:
          "API key not configured. Add the server credential in Vercel project settings.",
      },
      { status: 409 },
    );
  try {
    return Response.json(
      { models: await listModels(provider) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Model lookup failed.",
      },
      { status: 502 },
    );
  }
}
