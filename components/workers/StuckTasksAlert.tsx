import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { StuckGroup } from '@/lib/workers/health';

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Amber banner for queued worker tasks that no online worker can claim. */
export function StuckTasksAlert({ groups }: { groups: StuckGroup[] }) {
  if (!groups.length) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="inline-flex items-center gap-2 font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" /> Worker tasks stuck in the queue
      </h2>
      <p className="mt-1 text-sm text-amber-700">
        No online worker can run these. Start the worker that handles them (photo merge/enhance runs on the Office NAS worker).
      </p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">
        {groups.map((g) => (
          <li key={g.task_type}>
            <span className="font-medium">{g.count}× {g.task_type.replace(/_/g, ' ')}</span>
            <span className="text-amber-700"> — oldest queued {ago(g.oldest_created_at)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/dashboard/workers"
        className="mt-3 inline-block rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
      >
        Open Workers →
      </Link>
    </section>
  );
}
