import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hourlyActionSchema } from '@/lib/contractor-work/hourly';
import { workActor, workDb, workError, WorkError, readWorkBody } from '@/lib/contractor-work/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(req: Request) {
  try {
    const actor = await workActor();
    if (!actor.admin && !actor.contractorActive) throw new WorkError('This contractor account is inactive.', 403);
    const db = workDb();
    const url = new URL(req.url), wanted = url.searchParams.get('id');
    if (wanted) {
      if (!actor.admin) throw new WorkError('Office administrator access is required.', 403);
      if (!z.string().uuid().safeParse(wanted).success) throw new WorkError('Invalid assignment.');
      const query = db.from('contractor_hourly_assignments').select('id').eq('id', wanted);
      const { data, error } = await query.maybeSingle();
      if (error) throw new WorkError('Hourly work is temporarily unavailable.', 503);
      if (!data) throw new WorkError('Assignment not found.', 404);
      const { data: events, error: eventError } = await db.from('contractor_hourly_events')
        .select('id,kind,details,created_at').eq('assignment_id', wanted).order('created_at', { ascending: false });
      if (eventError) throw new WorkError('Could not load history.', 503);
      return NextResponse.json({ events }, { headers });
    }
    const page = Number(url.searchParams.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 100000) throw new WorkError('Invalid page.');
    const state = url.searchParams.get('status') ?? 'active';
    if (!['active', 'all', 'assigned', 'submitted', 'approved', 'paid', 'cancelled'].includes(state)) throw new WorkError('Invalid status.');
    let query = db.from('contractor_hourly_assignments')
      .select('*,contractors(full_name,payout_method,payout_details)').order('event_date', { ascending: false }).order('id', { ascending: false })
      .range(page * 40, page * 40 + 40);
    if (!actor.admin) query = query.eq('contractor_id', actor.contractorId);
    if (state === 'active') query = query.in('status', ['assigned', 'submitted', 'approved']);
    else if (state !== 'all') query = query.eq('status', state);
    const [items, contractors] = await Promise.all([
      query,
      actor.admin ? db.from('contractors').select('id,full_name').eq('is_active', true).order('full_name') : Promise.resolve({ data: [], error: null }),
    ]);
    if (items.error || contractors.error) throw new WorkError('Could not load hourly assignments.', 503);
    return NextResponse.json({ items: (items.data ?? []).slice(0, 40), more: (items.data?.length ?? 0) > 40, contractors: contractors.data, admin: actor.admin }, { headers });
  } catch (e) { return workError(e); }
}

export async function POST(req: Request) {
  try {
    const actor = await workActor();
    if (!actor.admin && !actor.contractorActive) throw new WorkError('This contractor account is inactive.', 403);
    const parsed = hourlyActionSchema.safeParse(await readWorkBody(req));
    if (!parsed.success) throw new WorkError(parsed.error.issues[0]?.message ?? 'Check the assignment details.');
    const { action, id, ...payload } = parsed.data;
    if (!actor.admin && action !== 'submit') throw new WorkError('Office administrator access is required.', 403);
    const { data, error } = await workDb().rpc('contractor_hourly_action', {
      p_actor: actor.id, p_action: action, p_id: id,
      p_version: 'version' in payload ? payload.version : null, p_data: payload,
    });
    if (error) { console.error('[hourly-work]', error.code); throw new WorkError('Could not save hourly work. Reload and retry.', 503); }
    if (data?.error) {
      const status = data.error === 'forbidden' ? 403 : data.error === 'not_found' ? 404 : 409;
      const messages: Record<string, string> = {
        forbidden: 'You do not have access to this action.', not_found: 'Assignment not found.',
        changed: 'This assignment changed. Reload before continuing.', invalid_state: 'This action is no longer available. Reload the assignment.',
        inactive_contractor: 'Choose an active contractor.', note_required: 'Add a note explaining extra time or the hours adjustment.',
        duplicate: 'This assignment was already created. Reload to see it.', invalid_data: 'Check the rate, date and hours.',
      };
      throw new WorkError(messages[data.error] ?? 'Could not save this change.', status);
    }
    return NextResponse.json({ id: data.id, message: {
      create: 'Assignment created. It is now available in the contractor portal.', edit: 'Assignment details saved.',
      submit: 'Hours submitted for office approval.', approve: 'Hours approved and added to the balance owed.',
      return: 'Returned for updated hours. Any previous approval has been removed.',
      cancel: 'Assignment cancelled. The history is retained.', pay: 'Payment recorded. No funds were transferred by Ops.',
    }[action] }, { headers });
  } catch (e) { return workError(e); }
}
