import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TeamAssignmentPage from '@/app/field/assignments/[id]/page';

const orderId = '8947decc-472b-4705-8ae8-de2bfe919a41';
const memberId = 'dc44ecbb-65c2-4765-8b2f-7d3ced4ce569';
const property = '12 Example Lane';
const now = '2026-04-01T15:00:00Z';
const controls = 'Accept or decline this offer';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));
vi.mock('@/components/field/RespondControl', () => ({ RespondControl: () => 'Accept or decline this offer' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: () => ({ data: { user: { id: memberId } } }) } }),
  createAdminClient: () => ({
    from(table: string) {
      let rows = state.tables[table];
      function filter(key: string, value: unknown) {
        rows = rows.filter(row => row[key] === value);
        return query;
      }
      const first = () => ({ data: rows[0] ?? null, error: null });
      const query = {
        select: () => query,
        eq: filter,
        is: filter,
        in(key: string, values: unknown[]) {
          rows = rows.filter(row => values.includes(row[key]));
          return query;
        },
        limit: () => query,
        single: first,
        maybeSingle: first,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  state.tables = {
    team_members: [{ id: memberId, role: 'photographer', is_active: true }],
    assignment_dispatch_events: [],
    orders: [{
      id: orderId, photographer_id: memberId, contractor_id: null, archived_at: null,
      auto_dispatch: true, assignment_state: 'awaiting_response', assignment_round: 2,
      assignment_confirmation_mode: 'manual', assignment_due_at: '2026-04-01T16:00:00Z',
      scheduled_at: '2026-04-03T15:00:00Z', status: 'scheduled', timezone: 'America/New_York',
      listings: { address_line1: property },
    }],
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderAssignment(round?: string) {
  const props = { params: Promise.resolve({ id: orderId }), searchParams: Promise.resolve({ round }) };
  return renderToStaticMarkup(await TeamAssignmentPage(props));
}

it.each(['admin', 'photographer'])('gives a former assignee a private, actionable result (%s)', async role => {
  state.tables.team_members[0].role = role;
  state.tables.orders[0].photographer_id = 'replacement-photographer';
  const html = await renderAssignment();
  expect(html).not.toContain(property);
  expect(html).not.toContain(controls);
  expect(html).not.toContain('replacement-photographer');
  expect(html).toMatch(/no longer|unavailable|closed/i);
  expect(html.includes(`href="/dashboard/orders/${orderId}"`)).toBe(role === 'admin');
});

it('closes an automatic offer at the deadline before dispatch runs', async () => {
  state.tables.orders[0].assignment_due_at = now;
  const html = await renderAssignment('2');
  expect(html).toContain('Response window closed');
  expect(html).not.toContain(controls);
});

it.each(['awaiting_response', 'needs_attention'])('keeps an eligible manual offer actionable after the reminder deadline (%s)', async assignmentState => {
  Object.assign(state.tables.orders[0], {
    auto_dispatch: false, assignment_state: assignmentState,
    assignment_due_at: assignmentState === 'needs_attention' ? null : '2026-04-01T14:00:00Z',
  });
  const html = await renderAssignment('2');
  expect(html).toContain(property);
  expect(html).toContain(controls);
});

it('closes a manual offer after that photographer has declined the same round', async () => {
  Object.assign(state.tables.orders[0], {
    auto_dispatch: false, assignment_state: 'needs_attention', assignment_due_at: null,
  });
  state.tables.assignment_dispatch_events.push({
    order_id: orderId, round: 2, team_member_id: memberId, event: 'declined_by_photographer',
  });
  expect(await renderAssignment('2')).not.toContain(controls);
});

it.each([undefined, '2'])('opens a current offer with the original or versioned email link (%s)', async round => {
  const html = await renderAssignment(round);
  expect(html).toContain(property);
  expect(html).toContain(controls);
});

it('prevents an older email from accepting a newer round assigned to the same person', async () => {
  const html = await renderAssignment('1');
  expect(html).not.toContain(controls);
  expect(html).toMatch(/no longer|unavailable|closed|earlier|newer|changed|previous/i);
});
