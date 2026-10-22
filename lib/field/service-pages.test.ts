import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
const state = vi.hoisted(() => ({ order: {} as any, columns: [] as string[] }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ usePathname: () => '/field/shoots', redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('not found'); } }));
vi.mock('@/components/field/ShootUpload', () => ({ ShootUpload: () => 'Upload control' }));
vi.mock('@/components/field/RespondControl', () => ({ RespondControl: () => 'Accept or decline control' }));
vi.mock('@/lib/supabase/server', () => {
  const db = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'karen-user' } } }) }, from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const rows = () => (table === 'contractors' ? [{ id: 'karen', auth_user_id: 'karen-user', full_name: 'Karen' }] : [state.order]).filter(r => filters.every(f => f(r)));
    const q: any = {
      select: (columns: string) => { state.columns.push(columns); return q; },
      eq: (key: string, value: any) => { filters.push(r => r[key] === value); return q; },
      in: (key: string, values: any[]) => { filters.push(r => values.includes(r[key])); return q; },
      not: () => q, order: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null }), single: async () => ({ data: rows()[0] ?? null }),
      then: (resolve: any) => Promise.resolve({ data: rows() }).then(resolve),
    }; return q;
  } });
  return { createClient: db, createAdminClient: db };
});
import DetailPage from '@/app/field/shoots/[id]/page';
import ListPage from '@/app/field/shoots/page';
import CalendarPage from '@/app/field/calendar/page';
beforeEach(() => {
  vi.stubGlobal('React', React);
  state.columns = [];
  state.order = { id: 'own', contractor_id: 'karen', status: 'booked', source: 'manual', created_at: '2026-10-20T12:00:00Z', scheduled_at: '2026-10-22T19:00:00Z', timezone: 'America/New_York', internal_notes: null, listing: { address_line1: 'Sample property', city: 'Bluffton', state: 'SC', sqft: 2400 }, order_items: [{ description: 'Interior/Exterior Photography', quantity: 1 }, { description: '3D Home + Floor Plan', quantity: 1, products: { name: '3D Home + Floor Plan', kind: 'addon', slug: 'three_d_floor_plan' } }] };
});
it('renders both captures above acceptance and upload on the actual shoot detail page', async () => {
  const html = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ id: 'own' }) }));
  expect(html).toContain('360 Tour'); expect(html).toContain('Floor Plan');
  expect(html.indexOf('Required shoot services')).toBeLessThan(html.indexOf('Accept or decline control'));
  expect(html.indexOf('3D Home + Floor Plan')).toBeLessThan(html.indexOf('Upload control'));
  expect(state.columns.some(c => c.includes('order_items(description,quantity,products(name,kind,slug))'))).toBe(true);
  // Optional local visual inspection uses a synthetic address, never customer data.
  if (process.env.FIELD_SERVICE_PREVIEW) writeFileSync(process.env.FIELD_SERVICE_PREVIEW, html);
});
it('renders the same scope in the shoot list and calendar without the outdated has_360 flag', async () => {
  state.order.has_360 = false;
  for (const page of [ListPage, CalendarPage]) {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('360 Tour'); expect(html).toContain('Floor Plan');
    expect(html).toContain('3D Home + Floor Plan');
  }
});
it('shows an explicit office-confirmation warning when no services are recorded', async () => {
  state.order.order_items = [];
  const html = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ id: 'own' }) }));
  expect(html).toContain('Services not specified. Confirm with the office before the shoot.');
});
