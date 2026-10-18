import { expect, it } from 'vitest';
import { projectFilters, projectListHref, projectPage } from './list';

type Row = { id: string; name: string; status: string; created_at: string };
function database(rows: Row[], error: unknown = null) {
  let selected = [...rows];
  const chain = {
    select: () => chain,
    eq: (field: keyof Row, value: string) => { selected = selected.filter(row => row[field] === value); return chain; },
    neq: (field: keyof Row, value: string) => { selected = selected.filter(row => row[field] !== value); return chain; },
    ilike: () => chain,
    order: () => chain,
    range: async (from: number, to: number) => ({ data: selected.slice(from, to + 1), count: selected.length, error }),
  };
  return { from: () => chain } as never;
}
const archived = Array.from({ length: 1050 }, (_, i) => ({ id: `archive-${i}`, name: 'Imported history', status: 'archived', created_at: '2026-10-17' }));
const production = { id: 'production-project', name: 'Podcast production', status: 'active', created_at: '2026-01-01' };

it('keeps older production projects visible after more than one thousand new archive imports', async () => {
  const result = await projectPage(database([...archived, production]), projectFilters({}));
  expect(result.data).toEqual([production]);
  expect(result.count).toBe(1);
});
it('preserves access to the complete archive through server pagination', async () => {
  const result = await projectPage(database([...archived, production]), projectFilters({ view: 'archived', page: '20' }));
  expect(result.count).toBe(1050);
  expect(result.data).toEqual(archived.slice(1000, 1050));
  expect(result.data).not.toContainEqual(production);
  expect(projectListHref(projectFilters({ view: 'archived', page: '20', q: 'Wedding & family' }))).toBe('/dashboard/projects?view=archived&q=Wedding+%26+family&page=20');
});
it('does not present a partial project list or counts when the database fails', async () => {
  const error = { message: 'database failure' };
  expect(await projectPage(database([production], error), projectFilters({}))).toEqual({ data: [], count: 0, error });
});
it('does not present results with incomplete pagination metadata', async () => {
  const response = { data: [production], count: null, error: null };
  const chain = { select: () => chain, neq: () => chain, order: () => chain, range: async () => response };
  const result = await projectPage({ from: () => chain } as never, projectFilters({}));
  expect(result.data).toEqual([]);
  expect(result.count).toBe(0);
  expect(result.error?.message).toMatch(/complete project list/);
});
