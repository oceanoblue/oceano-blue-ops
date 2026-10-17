import { runSessionNotifications } from "@/lib/crm/scheduling-mail";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: Request) {
    if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
        return Response.json({ error: "unauthorized" }, { status: 401 });
    try {
        return Response.json(await runSessionNotifications(), { headers: { "Cache-Control": "no-store" } });
    }
    catch {
        return Response.json({ error: "session_notifications_unavailable" }, { status: 503 });
    }
}
