'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { fmtCents } from '@/lib/utils/format';
import { dollarsToCents, serviceEditSchema, servicePrice, type ServiceProduct } from '@/lib/orders/service-pricing';

type Line = { product_id?: string | null; description?: string; service_type?: string; quantity: number; unit_price_cents: number; total_cents: number };
type Draft = { key: string; product_id: string | null; description: string; quantity: string; price: string };
type Props = { orderId: string; updatedAt: string; sqft: number | null; paid: boolean; total: number; items: Line[]; products: ServiceProduct[] };

export function OrderServicesEditor(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Draft[]>([]);
  const [size, setSize] = useState('');
  const [adjustment, setAdjustment] = useState('0');
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Capture the version at the moment editing starts, even if the parent refreshes.
  const [baseline, setBaseline] = useState({ updatedAt: props.updatedAt, sqft: props.sqft });
  const originalSubtotal = props.items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
  const subtotal = rows.reduce((sum, row) => sum + Number(row.quantity) * dollarsToCents(row.price), 0);
  const draftTotal = subtotal + dollarsToCents(adjustment);
  const sizeValue = size.trim() ? Number(size) : null;

  function edit() {
    setRows(props.items.map(item => ({ key: crypto.randomUUID(), product_id: item.product_id ?? null,
      description: item.description || item.service_type?.replace(/_/g, ' ') || 'Service',
      quantity: String(item.quantity), price: (item.unit_price_cents / 100).toFixed(2) })));
    setSize(props.sqft ? String(props.sqft) : '');
    setAdjustment(((props.total - originalSubtotal) / 100).toFixed(2));
    setBaseline({ updatedAt: props.updatedAt, sqft: props.sqft });
    setError(''); setSaved(false); setSelected(''); setEditing(true);
  }
  function change(key: string, values: Partial<Draft>) {
    setRows(prev => prev.map(row => row.key === key ? { ...row, ...values } : row));
  }
  function add(product?: ServiceProduct) {
    setRows(prev => [...prev, { key: crypto.randomUUID(), product_id: product?.id ?? null,
      description: product?.name ?? '', quantity: '1', price: ((product ? servicePrice(product, sizeValue) : 0) / 100).toFixed(2) }]);
    setSelected(''); setError('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = serviceEditSchema.safeParse({ expected_updated_at: baseline.updatedAt, expected_sqft: baseline.sqft,
      sqft: sizeValue, adjustment_cents: dollarsToCents(adjustment),
      items: rows.map(row => ({ product_id: row.product_id, description: row.description,
        quantity: Number(row.quantity), unit_price_cents: dollarsToCents(row.price) })) });
    if (!parsed.success) { setError('Check the service names, quantities, prices, and square footage. The total cannot be negative.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/orders/${props.orderId}/services`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save services.');
      setEditing(false); setSaved(true); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save services.'); }
    finally { setBusy(false); }
  }

  return <section className="card p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Services</h2>
      {!editing && !props.paid && <button type="button" onClick={edit} className="btn-secondary text-sm inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Edit services</button>}
    </div>
    {saved && <p role="status" className="mb-3 text-sm text-emerald-700">Services saved. Order total updated.</p>}
    {!editing ? <>
      {props.sqft ? <p className="mb-3 text-sm text-slate-500">Property size: {props.sqft.toLocaleString()} sq ft</p>
        : <p className="mb-3 text-sm text-amber-800">Property size not entered. Edit services to set a price or add square footage.</p>}
      {props.items.length ? <ul className="text-sm divide-y divide-slate-100">{props.items.map((item, index) => <li key={index} className="py-2 flex justify-between gap-3">
        <span>{item.description || item.service_type}{item.quantity > 1 && <span className="text-slate-500"> · {item.quantity} × {fmtCents(item.unit_price_cents)}</span>}</span>
        <span className="font-medium whitespace-nowrap">{fmtCents(item.quantity * item.unit_price_cents)}</span>
      </li>)}</ul> : <p className="text-sm text-slate-500">No line items.</p>}
      {props.total !== originalSubtotal && <div className="flex justify-between py-2 text-sm text-slate-500"><span>Adjustment</span><span>{fmtCents(props.total - originalSubtotal)}</span></div>}
      <div className="mt-3 border-t pt-3 flex justify-between text-sm"><span>Total</span><strong>{fmtCents(props.total)}</strong></div>
      {props.paid && <p className="mt-3 text-xs text-slate-500">Paid invoice. Create a separate order for additional services.</p>}
    </> : <form onSubmit={save} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        <div className="rounded-lg bg-slate-50 p-3 space-y-2">
          <label className="block text-sm">Property size (sq ft)
            <input className="input mt-1" type="number" min="1" max="1000000" step="1" value={size} onChange={e => setSize(e.target.value)} placeholder="Optional" />
          </label>
          <button type="button" className="btn-secondary text-xs" disabled={!sizeValue || !Number.isInteger(sizeValue) || sizeValue < 1 || sizeValue > 1000000}
            onClick={() => setRows(prev => prev.map(row => { const product = props.products.find(p => p.id === row.product_id); return product ? { ...row, price: (servicePrice(product, sizeValue) / 100).toFixed(2) } : row; }))}>
            Apply size-based prices
          </button>
          <p className="text-xs text-slate-500">Entering a size keeps your prices. Apply size-based prices to replace catalog service prices, or edit any price below.</p>
        </div>
        {rows.map((row, index) => <div key={row.key} className="rounded-lg border border-slate-200 p-3 space-y-3">
          <div className="flex items-end gap-2">
            <label className="block flex-1 text-sm">Service {index + 1}<input className="input mt-1" required maxLength={200} value={row.description} onChange={e => change(row.key, { description: e.target.value })} /></label>
            <button type="button" className="btn-ghost p-2 text-rose-600" aria-label={`Remove ${row.description || `service ${index + 1}`}`} onClick={() => setRows(prev => prev.filter(r => r.key !== row.key))}><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <label className="text-sm">Quantity<input className="input mt-1" type="number" required min="1" max="20" step="1" value={row.quantity} onChange={e => change(row.key, { quantity: e.target.value })} /></label>
            <label className="text-sm">Unit price ($)<input className="input mt-1" type="number" required min="0" max="100000" step="0.01" value={row.price} onChange={e => change(row.key, { price: e.target.value })} /></label>
            <p className="pb-2 text-right text-sm font-medium">{Number.isFinite(dollarsToCents(row.price)) ? fmtCents(Number(row.quantity) * dollarsToCents(row.price)) : '—'}</p>
          </div>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <label className="flex-1 min-w-40 text-sm">Add a service<select className="input mt-1" value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">Choose a service</option>{props.products.map(product => <option key={product.id} value={product.id}>{product.name} · {fmtCents(servicePrice(product, sizeValue))}</option>)}
          </select></label>
          <button type="button" className="btn-secondary self-end" disabled={!selected || rows.length >= 30} onClick={() => { const product = props.products.find(p => p.id === selected); if (product) add(product); }}><Plus className="inline h-4 w-4 mr-1" />Add</button>
        </div>
        <button type="button" className="text-sm text-ocean-700 underline" disabled={rows.length >= 30} onClick={() => add()}>Add custom service</button>
        <label className="block text-sm">Adjustment ($)<input className="input mt-1" type="number" required step="0.01" value={adjustment} onChange={e => setAdjustment(e.target.value)} /><span className="text-xs text-slate-500">Use a negative amount for a discount. Existing adjustments are preserved.</span></label>
        <div aria-live="polite" className="border-t pt-3 flex justify-between text-sm"><span>New total</span><strong>{Number.isFinite(draftTotal) ? fmtCents(draftTotal) : '—'}</strong></div>
        <p className="text-xs text-slate-500">If added services need more time, update the appointment separately.</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => { setEditing(false); setError(''); }}>Cancel</button><button type="submit" className="btn-primary">{busy ? 'Saving…' : 'Save services'}</button></div>
      </fieldset>
    </form>}
  </section>;
}
