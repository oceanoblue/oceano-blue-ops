import { CrmError } from "@/lib/crm/server";

/** Every query passed here must end in a unique, stable ordering. */
export async function readSocialPages<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 250;
  for (let from = 0; ; from += pageSize) {
    const page = await query(from, from + pageSize - 1);
    if (page.error || !Array.isArray(page.data)) throw new CrmError("Social Studio is unavailable. Please retry.", 503);
    const rows = page.data as T[];
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
}
