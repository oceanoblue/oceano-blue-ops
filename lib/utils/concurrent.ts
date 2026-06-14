/**
 * Map over items running at most `limit` async operations at once, preserving
 * input order in the results. Replaces sequential `for … await` loops (which
 * make latency scale linearly with item count and blow serverless timeouts on
 * large batches) without the unbounded blast radius of a bare `Promise.all`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const max = Math.min(Math.max(1, limit), items.length || 1);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: max }, worker));
  return results;
}
