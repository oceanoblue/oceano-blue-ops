import { z } from "zod";
import { crmActor, crmDb, crmError, CrmError } from "@/lib/crm/server";
export async function GET(_req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        await crmActor();
        const id = z.string().uuid().parse((await params).id);
        const { data, error } = await crmDb().from("crm_appointments").select("manage_token").eq("id", id).maybeSingle();
        if (error || !data)
            throw new CrmError("Session not found.", 404);
        return Response.json({ path: `/meet/manage/${data.manage_token}` }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    }
    catch (e) {
        return crmError(e);
    }
}
