import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ error: 'order_id required' }, { status: 400 });

  const { data: jobs, error } = await supabase
    .from('ai_jobs')
    .select('id, job_type, provider, model, status, error_message, cost_cents, duration_ms, output_photo_ids, created_at, completed_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs });
}
