import { z } from "zod";
import { crmActor, crmError } from "@/lib/crm/server";
import { fileDownloadUrl } from "@/lib/social-onboarding/server";

export const dynamic = "force-dynamic";

/** Office: download one client file through a five-minute signed link. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await crmActor();
    const id = z.string().uuid().parse((await params).id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: await fileDownloadUrl(id),
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return crmError(e);
  }
}
