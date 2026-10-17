import { z } from "zod";
import { crmActor, crmDb, crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { sessionTypeSchema } from "@/lib/crm/scheduling-types";
import { changeSession, schedulingProduction, schedulingRead, sessionRpcError, sessionCalendarWriteAccess } from "@/lib/crm/scheduling-server";
import { fetchMemberBusy } from "@/lib/google-calendar/api";
const actions = z.discriminatedUnion("action", [
    z.object({ action: z.literal("type_save"), id: z.string().uuid(), version: z.number().int().positive().nullable(), data: sessionTypeSchema }),
    z.object({ action: z.literal("cancel"), id: z.string().uuid(), version: z.number().int().positive() }),
]);
export async function GET() { try {
    await crmActor();
    return Response.json(await schedulingRead(), { headers: { "Cache-Control": "private, no-store" } });
}
catch (e) {
    return crmError(e);
} }
export async function POST(req: Request) {
    try {
        const actor = await crmActor();
        sameOrigin(req);
        schedulingProduction();
        const b = actions.parse(await readJson(req, 20000));
        if (b.action === "cancel") {
            const { data, error } = await crmDb().from("crm_appointments").select("*").eq("id", b.id).maybeSingle();
            if (error || !data)
                throw new CrmError("Session not found.", 404);
            return Response.json(await changeSession(data, { action: "cancel", version: b.version }, actor), { headers: { "Cache-Control": "no-store" } });
        }
        if (b.data.published) {
            await sessionCalendarWriteAccess(b.data.owner_id);
            const verification = await fetchMemberBusy(b.data.owner_id, new Date().toISOString(), new Date(Date.now() + 86400000).toISOString());
            if (verification.source !== "own")
                throw new CrmError("Connect the host’s Google calendar before publishing this link.", 400);
        }
        const { data, error } = await crmDb().rpc("crm_session_type_save", { p_actor: actor, p_id: b.id, p_version: b.version, p_data: b.data });
        if (error?.code === "23505")
            throw new CrmError("That link address is already in use.", 409);
        sessionRpcError(error);
        return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    }
    catch (e) {
        return crmError(e);
    }
}
