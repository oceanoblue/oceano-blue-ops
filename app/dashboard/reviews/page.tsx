import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const supabase = createClient();
  const { data: reviews } = await supabase
    .from('review_sessions')
    .select('id, title, provider, status, external_url, created_at, jobs(title)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Reviews</h1>
        <p className="text-sm text-slate-600">
          Review sessions across Frame.io, Vimeo, Pixieset, and internal review.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th className="table-head px-4 py-3">Title</th>
              <th className="table-head px-4 py-3">Job</th>
              <th className="table-head px-4 py-3">Provider</th>
              <th className="table-head px-4 py-3">Status</th>
              <th className="table-head px-4 py-3">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(reviews ?? []).map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{r.title ?? 'Review'}</td>
                <td className="px-4 py-3 text-slate-700">{r.jobs?.title ?? '—'}</td>
                <td className="px-4 py-3 capitalize text-slate-700">{r.provider ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{r.status?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  {r.external_url ? (
                    <a href={r.external_url} className="text-ocean-700 hover:underline" target="_blank" rel="noreferrer">
                      Open →
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {(reviews ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No review sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
