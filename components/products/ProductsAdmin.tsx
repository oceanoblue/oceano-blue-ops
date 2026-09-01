'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, Pencil, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fmtCents } from '@/lib/utils/format';
import { ProductEditDrawer } from './ProductEditDrawer';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  short_description: string | null;
  long_description: string | null;
  cover_image_url: string | null;
  gallery_image_urls: string[];
  is_addon: boolean;
  is_active: boolean;
  base_price_cents: number;
  duration_minutes: number;
  sort_order: number;
  audiences: string[];
}

const TABS = [
  { id: 'services', label: 'Services', filter: (p: ProductRow) => !p.is_addon },
  { id: 'addons', label: 'Add-ons', filter: (p: ProductRow) => p.is_addon },
] as const;

export function ProductsAdmin() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('services');
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [showCreate, setShowCreate] = useState<'addon' | 'service' | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true });
    setProducts((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const current = useMemo(() => {
    const filter = TABS.find((t) => t.id === tab)!.filter;
    return products.filter(filter);
  }, [products, tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-ocean-100 text-ocean-700 grid place-items-center">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ocean-950">Products</h1>
            <p className="text-sm text-slate-600">
              Services and add-ons clients see in the booking wizard.
            </p>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreate(tab === 'addons' ? 'addon' : 'service')}
        >
          <Plus className="h-4 w-4" /> New {tab === 'addons' ? 'add-on' : 'service'}
        </button>
      </div>

      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = products.filter(t.filter).length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm -mb-px border-b-2 ${
                active
                  ? 'border-ocean-700 text-ocean-900 font-medium'
                  : 'border-transparent text-slate-600 hover:text-ocean-900'
              }`}
            >
              {t.label} <span className="text-slate-400">({count})</span>
            </button>
          );
        })}
      </nav>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : current.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">
            No {tab === 'addons' ? 'add-ons' : 'services'} yet.
          </p>
          <button
            className="btn-primary mt-4"
            onClick={() => setShowCreate(tab === 'addons' ? 'addon' : 'service')}
          >
            Create the first one
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {current.map((p) => (
            <ProductCard key={p.id} product={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {(editing || showCreate) && (
        <ProductEditDrawer
          product={editing}
          createKind={showCreate}
          onClose={() => {
            setEditing(null);
            setShowCreate(null);
          }}
          onSaved={async () => {
            setEditing(null);
            setShowCreate(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  onEdit,
}: {
  product: ProductRow;
  onEdit: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      className={`card overflow-hidden text-left transition hover:ring-2 hover:ring-ocean-300 ${
        product.is_active ? '' : 'opacity-60'
      }`}
    >
      <div className="aspect-[4/3] w-full bg-gradient-to-br from-ocean-100 to-ocean-50 relative">
        {product.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.cover_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-ocean-700 text-xs uppercase tracking-wide">
            {product.kind}
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {!product.is_active && (
            <span className="pill bg-slate-700 text-white">
              <EyeOff className="h-3 w-3" /> Hidden
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-slate-900">{product.name}</h3>
          <span className="pill bg-slate-100 text-slate-700 capitalize">{product.kind}</span>
        </div>
        {product.short_description && (
          <p className="mt-1 text-sm text-slate-600 line-clamp-2">{product.short_description}</p>
        )}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="font-semibold text-ocean-900">{fmtCents(product.base_price_cents)}</span>
          <span className="text-slate-500">
            {product.duration_minutes > 0 ? `${product.duration_minutes} min` : 'No time'}
          </span>
        </div>
        <div className="mt-3 inline-flex items-center gap-1 text-xs text-ocean-700">
          <Pencil className="h-3 w-3" /> Edit
        </div>
      </div>
    </button>
  );
}
