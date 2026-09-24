import { runDailyBriefings } from "@/lib/operations/runner";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await runDailyBriefings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Daily briefing failed. Check database migration and service credentials.",
      },
      { status: 500 },
    );
  }
}
