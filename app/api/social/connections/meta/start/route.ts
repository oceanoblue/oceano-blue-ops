import { NextResponse } from "next/server";
import { z } from "zod";
import { crmActor, crmDb, CrmError, crmError, sameOrigin } from "@/lib/crm/server";
import { beginMeta, META_COOKIE, META_CALLBACK, metaConfigured } from "@/lib/social/meta-connection";
import { appOrigin } from "@/lib/social/links";

export async function POST(req: Request) {
  try {
    const actor = await crmActor(); sameOrigin(req);
    if (process.env.VERCEL_ENV !== "production" || !metaConfigured()) throw new CrmError("Meta connection setup is required in live Ops.",503);
    const account = z.string().uuid().parse((await req.formData()).get("account"));
    const {data,error}=await crmDb().from("social_accounts").select("id,platforms").eq("id",account).eq("is_active",true).maybeSingle();
    if(error || !data) throw new CrmError("Sub-account unavailable.",404);
    const {saved,url}=beginMeta(actor,account,appOrigin()+META_CALLBACK,data.platforms);
    const out=NextResponse.redirect(url,303);
    out.cookies.set(META_COOKIE,saved,{path:META_CALLBACK,httpOnly:true,secure:true,sameSite:"lax",maxAge:600});
    out.headers.set("Cache-Control","private, no-store");return out;
  }catch(e){return crmError(e);}
}
