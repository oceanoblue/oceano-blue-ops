import { runAcquisition } from "@/lib/crm/acquisition-mail";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await runAcquisition());
  } catch {
    return Response.json(
      { error: "acquisition_processing_failed" },
      { status: 503 },
    );
  }
}
