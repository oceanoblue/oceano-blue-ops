import type { SupabaseClient } from '@supabase/supabase-js';

export const PROJECT_PAGE_SIZE = 50;
export type ProjectFilters = { view: 'current' | 'archived' | 'all'; query: string; page: number };
export function projectFilters(params: Record<string, string | string[] | undefined>): ProjectFilters {
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const page = Number(value('page'));
  return {
    view: value('view') === 'archived' ? 'archived' : value('view') === 'all' ? 'all' : 'current',
    query: value('q').trim().slice(0, 120),
    page: Number.isSafeInteger(page) && page >= 0 && page <= 100000 ? page : 0,
  };
}
export function projectListHref(filters: ProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== 'current') params.set('view', filters.view);
  if (filters.query) params.set('q', filters.query);
  if (filters.page) params.set('page', String(filters.page));
  return `/dashboard/projects${params.size ? `?${params}` : ''}`;
}
/** Filter before pagination: imported archive history must not displace current work. */
export async function projectPage(db: Pick<SupabaseClient, 'from'>, filters: ProjectFilters) {
  let request = db.from('projects')
    .select('id, name, status, due_date, language, clients(full_name), jobs(count)', { count: 'exact' });
  if (filters.view === 'current') request = request.neq('status', 'archived');
  if (filters.view === 'archived') request = request.eq('status', 'archived');
  if (filters.query) request = request.ilike('name', `%${filters.query.replace(/[\\%_]/g, '\\$&')}%`);
  const result = await request.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(filters.page * PROJECT_PAGE_SIZE, (filters.page + 1) * PROJECT_PAGE_SIZE - 1);
  if (result.error) return { data: [], count: 0, error: result.error };
  if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0) {
    return { data: [], count: 0, error: { message: 'The complete project list could not be loaded.' } };
  }
  return { data: result.data, count: result.count, error: null };
}
