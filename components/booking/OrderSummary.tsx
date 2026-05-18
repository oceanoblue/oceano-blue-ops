'use client';
import { MapPin, Calendar, Package, Edit2, Trash2 } from 'lucide-react';
import type { BookingState, Product } from '@/lib/booking/types';
import { fmtCents, fmtDateTime } from '@/lib/utils/format';

export function OrderSummary({
  state,
  products,
  onEditAddress,
  onEditSchedule,
  onRemoveItem,
}: {
  state: BookingState;
  products: Product[];
  onEditAddress?: () => void;
  onEditSchedule?: () => void;
  onRemoveItem?: (productId: string) => void;
}) {
  const productById = new Map(products.map((p) => [p.id, p]));
  const lineItems = state.items
    .map((it) => ({ ...it, product: productById.get(it.product_id) }))
    .filter((it) => it.product);
  const subtotal = lineItems.reduce(
    (sum, it) => sum + (it.product?.price_cents ?? 0) * it.quantity,
    0
  );

  return (
    <aside className="card p-5 space-y-4 sticky top-6">
      <h2 className="text-lg font-semibold text-ocean-950">Order Summary</h2>

      {state.address && (
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</span>
            {onEditAddress && (
              <button onClick={onEditAddress} className="text-slate-400 hover:text-ocean-700">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {state.address.address_line1}
            <div className="text-slate-500">
              {state.address.city}, {state.address.state} {state.address.zip}
            </div>
          </div>
        </div>
      )}

      {state.schedule.scheduled_at && (
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Appointment</span>
            {onEditSchedule && (
              <button onClick={onEditSchedule} className="text-slate-400 hover:text-ocean-700">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {fmtDateTime(state.schedule.scheduled_at)}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
          <Package className="h-3 w-3" /> Products ({lineItems.length})
        </div>
        {lineItems.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No products added yet</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {lineItems.map((it) => (
              <li key={it.product_id} className="flex items-start justify-between gap-2">
                <span className="text-slate-800">{it.product!.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-700">{fmtCents(it.product!.price_cents * it.quantity)}</span>
                  {onRemoveItem && (
                    <button
                      onClick={() => onRemoveItem(it.product_id)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lineItems.length > 0 && (
        <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{fmtCents(subtotal)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span>{fmtCents(subtotal)}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
