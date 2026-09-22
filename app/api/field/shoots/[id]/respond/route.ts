import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordContractorResponse, afterContractorResponse } from '@/lib/field/respond';

/**
 * Contractor accepts or declines their assigned shoot from the portal. The
 * authenticated contractor and assignment version scope an atomic conditional
 * write. Only a changed response notifies the office and syncs the calendar.
 */
const Body = z.object({
  round: z.number().int().min(0).default(0),
  response: z.enum(['accepted', 'declined']),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'validation_failed' }, { status: 400 });

  const admin=createAdminClient() as any;
  const {data:contractor}=await admin.from('contractors').select('id').eq('auth_user_id',user.id).eq('is_active',true).maybeSingle();
  if(!contractor)return NextResponse.json({error:'No photographer profile for this account.'},{status:403});
  const result=await recordContractorResponse({orderId:params.id,contractorId:contractor.id,round:parsed.data.round,response:parsed.data.response,note:parsed.data.note});
  if(!result.ok)return NextResponse.json({error:'This assignment changed or expired. Refresh your shoots.'},{status:409});

  await afterContractorResponse({
    result,
    orderId: params.id,
    response: parsed.data.response,
    note: parsed.data.note ?? null,
    source: 'portal',
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
  });

  return NextResponse.json({ ok: true, response: parsed.data.response });
}
