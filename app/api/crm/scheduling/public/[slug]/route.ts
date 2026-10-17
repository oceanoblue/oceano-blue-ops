import { crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { publicSessionType, readSessionType, sessionAvailability, bookSession, schedulingProduction } from "@/lib/crm/scheduling-server";
import { sessionSlugSchema } from "@/lib/crm/scheduling-types";
import { validSessionDay } from "@/lib/crm/scheduling-slots";
import { enforceCrmPublicRateLimit } from "@/lib/security/crm-public-rate-limit";
type Context={params:Promise<{slug:string}>};
export async function GET(req:Request,{params}:Context) {
  try {
    const limited=await enforceCrmPublicRateLimit(req,"session-slots",80,3600);if(limited)return limited;
    const slug=sessionSlugSchema.parse((await params).slug),day=new URL(req.url).searchParams.get("date");
    const type=await readSessionType(slug);
    if(!day)return Response.json({type:publicSessionType(type)},{headers:{"Cache-Control":"no-store"}});
    if(!validSessionDay(day))throw new CrmError("Choose a valid date.");
    const {slots}=await sessionAvailability(type,day);
    return Response.json({slots,timezone:type.timezone},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return crmError(e);}
}
export async function POST(req:Request,{params}:Context) {
  try {
    sameOrigin(req);schedulingProduction();const limited=await enforceCrmPublicRateLimit(req,"session-book",8,3600);if(limited)return limited;
    const slug=sessionSlugSchema.parse((await params).slug);
    return Response.json(await bookSession(slug,await readJson(req,10000)),{headers:{"Cache-Control":"no-store"}});
  }catch(e){return crmError(e);}
}
