import { crmDb, crmError, CrmError, readJson, sameOrigin } from "@/lib/crm/server";
import { appointmentByToken, changeSession, sessionAvailability, sessionMonthAvailability, schedulingProduction } from "@/lib/crm/scheduling-server";
import { sessionTokenSchema, type SessionType } from "@/lib/crm/scheduling-types";
import { sessionCalendarFile, validSessionDay, validSessionMonth } from "@/lib/crm/scheduling-slots";
import { enforceCrmPublicRateLimit } from "@/lib/security/crm-public-rate-limit";
type Context={params:Promise<{token:string}>};
export async function GET(req:Request,{params}:Context) {
  try {
    const limited=await enforceCrmPublicRateLimit(req,"session-manage-read",80,3600);if(limited)return limited;
    const token=sessionTokenSchema.parse((await params).token),a=await appointmentByToken(token),q=new URL(req.url).searchParams;
    if (a.status === "pending_payment") throw new CrmError("Payment is required before this session is confirmed.", 409);
    if(q.get("calendar")==="1")return new Response(sessionCalendarFile(a),{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"attachment; filename=oceano-blue-session.ics","Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
    const {data,error}=a.session_type_id?await crmDb().from("crm_session_types").select("*").eq("id",a.session_type_id).maybeSingle():{data:null,error:null};
    if(error)throw new CrmError("Scheduling is unavailable.",503);
    if(!data&&!q.has("date")&&!q.has("month"))return Response.json({appointment:{id:a.id,title:a.title,location:a.location,timezone:a.timezone,full_name:a.full_name,starts_at:a.starts_at,ends_at:a.ends_at,status:a.status,version:a.version,confirmation_instructions:a.confirmation_instructions??""},slug:"",canReschedule:false},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
    if(!data||a.import_state==="reference")throw new CrmError("Contact the office to change this source appointment.",400);
    const type=data as SessionType;
    if(q.has("date")||q.has("month")) {
      if(q.has("date")&&q.has("month"))throw new CrmError("Choose either a date or a month.");
      if(!type.published||type.owner_id!==a.owner_id||a.status!=="confirmed")throw new CrmError("Contact the office to change this session.",400);
      if(q.has("month")) {
        const month=q.get("month")!;if(!validSessionMonth(month))throw new CrmError("Choose a valid month.");
        return Response.json(await sessionMonthAvailability(type,month,a),{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
      }
      const day=q.get("date")!;if(!validSessionDay(day))throw new CrmError("Choose a valid date.");
      const {slots}=await sessionAvailability(type,day,a);
      return Response.json({slots,timezone:type.timezone},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
    }
    return Response.json({appointment:{id:a.id,title:a.title,location:a.location,timezone:a.timezone,full_name:a.full_name,starts_at:a.starts_at,ends_at:a.ends_at,status:a.status,version:a.version,confirmation_instructions:a.confirmation_instructions??""},slug:type.slug,canReschedule:type.published&&type.owner_id===a.owner_id},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch(e){return crmError(e);}
}
export async function POST(req:Request,{params}:Context) {
  try {
    sameOrigin(req);schedulingProduction();const limited=await enforceCrmPublicRateLimit(req,"session-change",15,3600);if(limited)return limited;
    const token=sessionTokenSchema.parse((await params).token),a=await appointmentByToken(token);
    return Response.json(await changeSession(a,await readJson(req,3000)),{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
  }catch(e){return crmError(e);}
}
