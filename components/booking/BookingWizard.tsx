'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { StepHeader } from '@/components/booking/StepHeader';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { OrderSummary } from '@/components/booking/OrderSummary';
import { AddressStep } from '@/components/booking/AddressStep';
import { PropertyStep } from '@/components/booking/PropertyStep';
import { ProductsStep } from '@/components/booking/ProductsStep';
import { ScheduleStep } from '@/components/booking/ScheduleStep';
import { ContactStep } from '@/components/booking/ContactStep';
import type { BookingState, Product } from '@/lib/booking/types';
import { fmtDateTime, fmtAddress } from '@/lib/utils/format';

const EMPTY: BookingState = {
  step: 1,
  address: null,
  property: { sqft: 0 },
  items: [],
  schedule: {
    scheduled_at: null,
    duration_minutes: 60,
    timezone: 'America/New_York',
    access_method: '',
    highlights: '',
    photographer_id: null,
  },
  contact: { email: '', name: '', phone: '', brokerage: '' },
};

/**
 * Public booking wizard. Rendered at /book (real estate) and /book/architectural
 * (construction / architectural). `audience` selects which product catalog shows
 * and stamps the order's production profile — architectural bookings come in as
 * project_type=architectural (sober grade, architectural QC), never as MLS.
 */
export function BookingWizard({
  audience = 'real_estate',
  label,
}: {
  audience?: 'real_estate' | 'architectural';
  label?: string;
}) {
  const [state, setState] = useState<BookingState>(EMPTY);
  const [products, setProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string } | null>(null);

  const totalDuration = useMemo(() => {
    return (
      state.items.reduce((sum, it) => {
        const p = products.find((x) => x.id === it.product_id);
        return sum + (p?.duration_minutes ?? 0) * it.quantity;
      }, 0) || 60
    );
  }, [state.items, products]);

  const goto = (step: BookingState['step']) => setState((s) => ({ ...s, step }));

  async function submitBooking(contact: typeof state.contact) {
    if (!state.address || !state.schedule.scheduled_at) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/booking/v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_email: contact.email,
          client_name: contact.name || contact.email.split('@')[0],
          client_phone: contact.phone,
          client_brokerage: contact.brokerage,
          address_line1: state.address.address_line1,
          address_line2: state.address.address_line2,
          city: state.address.city,
          state: state.address.state,
          zip: state.address.zip,
          lat: state.address.lat,
          lng: state.address.lng,
          sqft: state.property.sqft,
          scheduled_at: state.schedule.scheduled_at,
          duration_minutes: totalDuration,
          timezone: state.schedule.timezone,
          access_method: state.schedule.access_method,
          highlights: state.schedule.highlights,
          photographer_id: state.schedule.photographer_id,
          items: state.items,
          project_type: audience === 'architectural' ? 'architectural' : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Booking failed');
      } else {
        setDone({ orderId: data.order_id });
        setState((s) => ({ ...s, step: 5, contact }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-6">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-semibold text-ocean-900">Booking confirmed 🎉</h1>
          <p className="mt-2 text-sm text-slate-600">
            Thanks! Your shoot is booked for{' '}
            <strong>{fmtDateTime(state.schedule.scheduled_at!)}</strong> at{' '}
            <strong>{state.address ? fmtAddress(state.address) : ''}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            We&apos;ll send a confirmation email shortly.
          </p>
          <div className="mt-6 flex gap-2 justify-center">
            <Link href="/portal" className="btn-secondary">Open portal</Link>
            <Link href="/" className="btn-ghost">Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo variant="dark" className="h-7 w-auto" />
            {label && (
              <span className="hidden sm:inline border-l border-slate-200 pl-3 text-sm font-medium text-slate-500">
                {label}
              </span>
            )}
          </Link>
          <StepHeader current={state.step} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {state.step === 1 && (
          <AddressStep
            initial={state.address}
            onComplete={(a) => setState((s) => ({ ...s, address: a, step: 2 }))}
          />
        )}

        {state.step === 2 && state.address && (
          <PropertyStep
            address={state.address}
            property={state.property}
            onBack={() => goto(1)}
            onEditAddress={() => goto(1)}
            onComplete={(a, p) => setState((s) => ({ ...s, address: a, property: p, step: 3 }))}
          />
        )}

        {state.step === 3 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <ProductsStep
              sqft={state.property.sqft}
              audience={audience}
              items={state.items}
              onBack={() => goto(2)}
              onChange={(items) => setState((s) => ({ ...s, items }))}
              onComplete={() => goto(4)}
              onLoaded={setProducts}
            />
            <OrderSummary
              state={state}
              products={products}
              onRemoveItem={(id) =>
                setState((s) => ({ ...s, items: s.items.filter((i) => i.product_id !== id) }))
              }
            />
          </div>
        )}

        {state.step === 4 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <ScheduleStep
              schedule={state.schedule}
              totalDuration={totalDuration}
              onBack={() => goto(3)}
              onComplete={(schedule) => setState((s) => ({ ...s, schedule, step: 5 }))}
            />
            <OrderSummary
              state={state}
              products={products}
              onEditAddress={() => goto(1)}
              onRemoveItem={(id) =>
                setState((s) => ({ ...s, items: s.items.filter((i) => i.product_id !== id) }))
              }
            />
          </div>
        )}

        {state.step === 5 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <ContactStep
              contact={state.contact}
              onBack={() => goto(4)}
              onSubmit={submitBooking}
              submitting={submitting}
              error={error}
            />
            <OrderSummary
              state={state}
              products={products}
              onEditAddress={() => goto(1)}
              onEditSchedule={() => goto(4)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
