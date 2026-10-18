import { runAcquisition } from "@/lib/crm/acquisition-mail";
import { runInquiryReminders } from "@/lib/crm/inquiry-mail";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [acquisition, inquiryReminders] = await Promise.all([runAcquisition(), runInquiryReminders()]);
    return Response.json({ ...acquisition, inquiryReminders });
  } catch {
    return Response.json(
      { error: "acquisition_processing_failed" },
      { status: 503 },
    );
  }
}
