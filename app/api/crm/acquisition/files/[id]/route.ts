import { z } from "zod";
import { crmActor, crmDb, crmError, CrmError } from "@/lib/crm/server";
import { appBase } from "@/lib/crm/acquisition-server";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await crmActor();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { data, error } = await crmDb()
      .from("crm_issued_files")
      .select(
        "id,snapshot,context,access_token,expires_at,revoked_at,responded_at,crm_file_responses(answers,created_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new CrmError("File details are unavailable.", 503);
    if (!data) throw new CrmError("File not found.", 404);
    const { access_token, ...safe } = data;
    const responses = data.crm_file_responses;
    return Response.json(
      {
        ...safe,
        crm_file_responses: Array.isArray(responses)
          ? responses
          : responses
            ? [responses]
            : [],
        url:
          !data.revoked_at && Date.parse(data.expires_at) > Date.now()
            ? `${appBase()}/smart-files/${access_token}`
            : null,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (e) {
    return crmError(e);
  }
}
