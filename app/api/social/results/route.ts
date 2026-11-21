import { crmActor,crmDb,crmError,CrmError,readJson,sameOrigin } from "@/lib/crm/server";
import { reportingAction } from "@/lib/social/reporting";
export async function POST(req:Request) {
  try {
    await crmActor();sameOrigin(req);
    if(process.env.VERCEL_ENV!=="production") throw new CrmError("Save changes in live Ops.",403);
    const input=reportingAction.parse(await readJson(req,5000));
    const db=crmDb();
    if(input.action==="mode") {
      const {data,error}=await db.from("social_programs").update({reporting_mode:input.mode}).eq("id",input.program).select("id").maybeSingle();
      if(error || !data) throw new CrmError("The reporting preference could not be saved.",409);
    }else{
      const {error}=await db.from("social_monthly_results").upsert({program_id:input.program,month:input.month+"-01",source:input.source,report_url:input.url,updated_at:new Date().toISOString()},{onConflict:"program_id,month"});
      if(error) throw new CrmError("The monthly report could not be saved.",409);
    }
    return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return crmError(e);}
}
