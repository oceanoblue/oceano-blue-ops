import { NextResponse } from "next/server";
import { z } from "zod";
import { crmActor, crmDb, CrmError, crmError, sameOrigin } from "@/lib/crm/server";
import { accountHref, appOrigin } from "@/lib/social/links";

/** Remove the locally saved identity and credential. Other client connections are independent. */
export async function POST(req: Request) {
  try {
    await crmActor();
    sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production") throw new CrmError("Changes are saved from live Ops only.",403);
    const form = await req.formData();
    const account = z.string().uuid().parse(form.get("account"));
    const platform = z.enum(["facebook","instagram"]).parse(form.get("platform"));
    const { error } = await crmDb().from("social_channel_connections").delete().eq("account_id",account).eq("platform",platform);
    if (error) throw new CrmError("Unable to remove the connection. Please retry.",503);
    const url = new URL(accountHref(account), appOrigin());
    url.searchParams.set("connection","Connection removed from Ops.");
    return NextResponse.redirect(url,303);
  } catch (e) { return crmError(e); }
}
