import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
export type OfficeClientOption = {
  id: string; full_name: string | null; email?: string | null;
  brokerage?: string | null; phone?: string | null; created_at?: string;
};
type Options = { columns?: string; activeOnly?: boolean };
type Result = { data: OfficeClientOption[]; error: { message: string } | null };
const PAGE_SIZE = 250;
const unavailable = (): Result => ({ data: [], error: { message: 'The complete client list could not be loaded. Refresh before choosing or adding a client.' } });
/** Pass the request's authenticated client so the same RLS applies to every
 * page. No admin client, new endpoint or global cache is used here. */
export async function officeClientOptions(db: SupabaseClient<Database>, options: Options = {}): Promise<Result> {
  const rows: OfficeClientOption[] = [];
  const ids = new Set<string>();
  let offset = 0, expected: number | null = null;
  try {
    do {
      let query = db.from('clients').select(options.columns ?? 'id, full_name', { count: 'exact' });
      if (options.activeOnly) query = query.eq('is_archived', false);
      const result = await query.order('full_name', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
      if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count! < 0) return unavailable();
      if (expected === null) expected = result.count!;
      // A changing directory cannot silently become a partial selector.
      if (expected !== result.count) return unavailable();
      const page = result.data as unknown as OfficeClientOption[];
      if (!page.length && offset < expected) return unavailable();
      for (const row of page) {
        if (typeof row.id !== 'string' || ids.has(row.id)) return unavailable();
        ids.add(row.id); rows.push(row);
      }
      // Advance by actual returned rows, even if a server's REST cap is below
      // PAGE_SIZE. A short page alone never proves that the directory is done.
      offset += page.length;
      if (offset > expected) return unavailable();
    } while (offset < expected!);
    return { data: rows, error: null };
  } catch { return unavailable(); }
}
