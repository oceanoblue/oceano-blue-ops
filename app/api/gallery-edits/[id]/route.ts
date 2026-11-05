import { z } from 'zod';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { editDb,editJson,readSmallJson } from '@/lib/gallery-edits/server';
const schema=z.object({status:z.enum(['approved','rejected']),review_confirmed:z.literal(true)}).strict();
export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  const gate=await requireTeamMember(); if(gate.error) return gate.error;
  const parsed=schema.safeParse(await readSmallJson(request));
  if(!parsed.success) return editJson({error:'Compare the original and edited photo before deciding.'},400);
  const {id}=await context.params;
  const {error}=await editDb().rpc('settle_gallery_edit',{p_id:id,p_status:parsed.data.status,p_actor:gate.user.id});
  return error?editJson({error:'Unable to change this edit. Refresh and check its current status.'},409):editJson({ok:true});
}
