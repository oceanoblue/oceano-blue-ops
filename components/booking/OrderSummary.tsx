'use client';
import { MapPin, Calendar, Package, Edit2, Trash2 } from 'lucide-react';
import type { BookingState, Product } from '@/lib/booking/types';
import { fmtCents, fmtDateTimeTz } from '@/lib/utils/format';

export function OrderSummary({
  state,
  products,
  onEditAddress,
  onEditSchedule,
  onEditServices,
  onRemoveItem,
}: {
  state: BookingState;
  products: Product[];
  onEditAddress?: () => void;
  onEditSchedule?: () => void;
  onEditServices?: () => void;
  onRemoveItem?: (productId: string) => void;
}) {
  const productById = new Map(products.map((p) => [p.id, p]));
  const lineItems = state.items
    .map((it) => ({ ...it, product: productById.get(it.product_id) }));
  const pricesReady = lineItems.every((it) => it.product);
  const subtotal = lineItems.reduce(
    (sum, it) => sum + (it.product?.price_cents ?? 0) * it.quantity,
    0
  );

  return (
    <aside id="booking-summary" className="card min-w-0 self-start scroll-mt-6 p-5 space-y-4 lg:sticky lg:top-6">
      <h2 className="text-lg font-semibold text-ocean-950">Your booking</h2>

      {state.address && (
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</span>
            {onEditAddress && (
              <button onClick={onEditAddress} aria-label="Edit property details" className="p-2 text-slate-500 hover:text-ocean-700">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {state.address.address_line1}
            {state.address.address_line2 && <div>{state.address.address_line2}</div>}
            <div className="text-slate-500">
              {state.address.city}, {state.address.state} {state.address.zip}
            </div>
            {state.property.sqft > 0 && <p className="mt-1 text-slate-500">{state.property.sqft.toLocaleString('en-US')} sq ft</p>}
          </div>
        </div>
      )}

      {state.schedule.scheduled_at && (
        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Appointment</span>
            {onEditSchedule && (
              <button onClick={onEditSchedule} aria-label="Edit date and time" className="p-2 text-slate-500 hover:text-ocean-700">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-800">
            {fmtDateTimeTz(state.schedule.scheduled_at, state.schedule.timezone)}
            <span className="ml-1">{new Intl.DateTimeFormat('en-US', { timeZone: state.schedule.timezone, timeZoneName: 'short' }).formatToParts(new Date(state.schedule.scheduled_at)).find((part) => part.type === 'timeZoneName')?.value}</span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500"><Package className="h-3 w-3" /> Services ({lineItems.length})</span>
          {onEditServices && <button onClick={onEditServices} className="text-sm text-ocean-700 underline underline-offset-4">Edit services</button>}
        </div>
        {lineItems.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Choose a service to see your total.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {lineItems.map((it) => (
              <li key={it.product_id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-slate-800">
                  {it.product?.name ?? (products.length > 0 ? 'Unavailable service' : 'Loading service…')}
                  {it.quantity > 1 && <span className="ml-1 text-slate-500">× {it.quantity}</span>}
                  {it.product?.is_addon && <span className="block text-xs text-slate-500">Optional add-on</span>}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-700">{it.product ? fmtCents(it.product.price_cents * it.quantity) : '—'}</span>
                  {onRemoveItem && (
                    <button
                      onClick={() => onRemoveItem(it.product_id)}
                      className="p-2 text-slate-500 hover:text-rose-600"
                      aria-label={`Remove ${it.product?.name ?? 'unavailable service'} from booking`}
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
        <div className="border-t border-slate-200 pt-3 space-y-2 text-sm">
          <div aria-live="polite" aria-atomic="true" className="flex justify-between font-semibold text-lg">
            <span>Total</span>
            <span>{pricesReady ? fmtCents(subtotal) : '—'}</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">Includes every selected service and add-on. Review your choices before submitting your booking.</p>
        </div>
      )}
    </aside>
  );
}
