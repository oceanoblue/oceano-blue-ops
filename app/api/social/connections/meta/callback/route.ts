import { NextRequest,NextResponse } from "next/server";
import { crmActor,CrmError } from "@/lib/crm/server";
import { META_COOKIE,META_CALLBACK,verifyMetaState,connectMeta,metaConfigured } from "@/lib/social/meta-connection";
import { appOrigin } from "@/lib/social/links";

export async function GET(req:NextRequest) {
  const origin=appOrigin();
  let path="/dashboard/social";
  function finish(message:string) {
    const url=new URL(path,origin); url.searchParams.set("connection",message);
    const out=NextResponse.redirect(url,303);
    out.cookies.set(META_COOKIE,"",{path:META_CALLBACK,maxAge:0,httpOnly:true,secure:true,sameSite:"lax"});
    out.headers.set("Cache-Control","private, no-store");out.headers.set("Referrer-Policy","no-referrer");return out;
  }
  try {
    if(process.env.VERCEL_ENV!=="production" || !metaConfigured()) return finish("Meta connection setup is required.");
    const actor=await crmActor();
    const account=verifyMetaState(req.cookies.get(META_COOKIE)?.value || "",req.nextUrl.searchParams.get("state") || "",actor);
    if(!account) return finish("The connection request expired. Start again from your sub-account.");
    path+=`/accounts/${account}`;
    const code=req.nextUrl.searchParams.get("code");
    if(!code || req.nextUrl.searchParams.has("error")) return finish("Meta authorization was not completed.");
    const count=await connectMeta(actor,account,code,origin+META_CALLBACK);
    return finish(`Verified ${count} read-only Meta profile${count===1?"":"s"}.`);
  }catch(e){return finish(e instanceof CrmError?e.message:"Meta could not verify the connection. Please try again.");}
}
