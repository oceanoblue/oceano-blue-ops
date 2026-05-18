'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ExistingLink {
  id: string;
  token: string;
  view_count: number;
  download_count: number;
}

export function DeliveryControl({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<ExistingLink | null>(null);
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    setAppUrl(window.location.origin);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('delivery_links')
        .select('id, token, view_count, download_count')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLink(data);
    })();
  }, [orderId]);

  function createLink() {
    start(async () => {
      const r = await fetch('/api/delivery-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await r.json();
      if (data.token) setLink({ id: data.id, token: data.token, view_count: 0, download_count: 0 });
      router.refresh();
    });
  }

  if (!link) {
    return (
      <button className="btn-primary w-full" disabled={pending} onClick={createLink}>
        <LinkIcon className="h-4 w-4" />
        Generate delivery link
      </button>
    );
  }

  const url = `${appUrl}/gallery/${link.token}`;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <input className="input" readOnly value={url} />
        <button
          className="btn-secondary"
          onClick={() => navigator.clipboard.writeText(url)}
          aria-label="Copy link"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{link.view_count} views · {link.download_count} downloads</span>
        <button onClick={createLink} className="hover:underline inline-flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> New link
        </button>
      </div>
    </div>
  );
}
