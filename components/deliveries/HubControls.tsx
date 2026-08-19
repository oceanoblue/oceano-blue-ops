'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check } from 'lucide-react';
import { buildDeliveryQuery } from '@/lib/deliveries/filters';

/** Client-filter dropdown for the Deliveries hub. Navigates on change,
 *  preserving the active status/type filters. */
export function ClientFilterSelect({
  clients,
  value,
  status,
  type,
}: {
  clients: Array<{ id: string; full_name: string }>;
  value: string | null;
  status: string | null;
  type: string | null;
}) {
  const router = useRouter();
  return (
    <select
      className="input h-8 max-w-[16rem] py-1 text-sm"
      value={value ?? ''}
      onChange={(e) =>
        router.push(`/dashboard/deliveries${buildDeliveryQuery({ status, type, client: e.target.value || null })}`, {
          scroll: false,
        })
      }
    >
      <option value="">All clients</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>{c.full_name}</option>
      ))}
    </select>
  );
}

/** Copy-to-clipboard button for a delivery link. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700"
      title="Copy link"
      aria-label="Copy delivery link"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
