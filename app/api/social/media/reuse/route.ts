import { z } from "zod";
import { crmActor,crmDb,crmError,CrmError,readJson,sameOrigin } from "@/lib/crm/server";
const selection=z.object({source:z.string().uuid(),target:z.string().uuid(),revision:z.number().int().positive(),source_revision:z.number().int().positive()});
export async function POST(request:Request){
  try{
    const actor=await crmActor();sameOrigin(request);
    if(process.env.VERCEL_ENV!=="production")throw new CrmError("Save changes in live Ops.",403);
    const input=selection.parse(await readJson(request,1000));
    if(input.source===input.target)throw new CrmError("Choose a different piece.");
    const db=crmDb();
    const {data:source,error}=await db.from("social_content_items").select("account_id,creative_path,creative_type").eq("id",input.source).eq("review_revision",input.source_revision).maybeSingle();
    if(error||!source?.creative_path||!source.creative_type)throw new CrmError("The source creative changed. Refresh to see the current version.",409);
    let target=db.from("social_content_items").update({creative_path:source.creative_path,creative_type:source.creative_type,updated_at:new Date().toISOString(),updated_by:actor})
      .eq("id",input.target).eq("review_revision",input.revision).eq("account_id",source.account_id).in("status",["planned","needs_media","in_design","internal_review"]);
    if(!source.creative_type.startsWith("video/"))target=target.neq("kind","reel");
    const {data:updated,error:updateError}=await target.select("id").maybeSingle();
    if(updateError||!updated)throw new CrmError("Choose an editable piece for this sub-account. A reel needs a video.",409);
    return Response.json({ok:true});
  }catch(e){return crmError(e);}
}
