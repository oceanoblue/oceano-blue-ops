'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { z } from 'zod';
import { StepHeader } from '@/components/booking/StepHeader';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { OrderSummary } from '@/components/booking/OrderSummary';
import { AddressStep } from '@/components/booking/AddressStep';
import { PropertyStep } from '@/components/booking/PropertyStep';
import { ProductsStep } from '@/components/booking/ProductsStep';
import { ScheduleStep } from '@/components/booking/ScheduleStep';
import { ContactStep } from '@/components/booking/ContactStep';
import type { BookingState, Product, SelectedItem } from '@/lib/booking/types';
import { selectionProblem } from '@/lib/booking/service-selection';
import { fmtCents, fmtDateTimeTz, fmtAddress } from '@/lib/utils/format';

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


const SavedDraft = z.object({
  version: z.literal(1), savedAt: z.number(),
  state: z.object({
    address: z.object({formatted:z.string(),address_line1:z.string(),address_line2:z.string(),city:z.string(),state:z.string(),zip:z.string(),lat:z.number().nullable(),lng:z.number().nullable()}),
    property: z.object({sqft:z.number().min(0)}),
    items: z.array(z.object({product_id:z.string().uuid(),quantity:z.number().int().min(1).max(20)})).max(30),
    contact: z.object({email:z.string(),name:z.string(),phone:z.string(),brokerage:z.string()}),
    schedule: z.object({timezone:z.string().refine(value => {try {new Intl.DateTimeFormat('en',{timeZone:value});return true;} catch{return false;}}),highlights:z.string()}),
  }),
});

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
  const [restored, setRestored] = useState(false);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const draftKey = `oceano-booking-${audience}`;
  const [products, setProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; pending?: boolean } | null>(null);
  const main = useRef<HTMLElement>(null);
  const previousStep = useRef(state.step);

  useEffect(() => {
    if (previousStep.current === state.step) return;
    previousStep.current = state.step;
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [state.step]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = SavedDraft.parse(JSON.parse(raw));
        if (draft.version === 1 && Date.now() - draft.savedAt < 4 * 3600000 && draft.state?.address && Array.isArray(draft.state?.items)) {
          setState({ ...EMPTY, ...draft.state, step: draft.state.property.sqft >= 100 ? 3 : 2, schedule: { ...EMPTY.schedule, ...draft.state.schedule, scheduled_at: null, photographer_id: null, access_method: '' } });
        }
      }
    } catch { /* Storage unavailable or an obsolete draft. */ }
    setRestored(true);
  }, [draftKey]);

  useEffect(() => {
    if (!restored || done) return;
    try {
      // Session-only; never persist lockbox/access codes in browser storage.
      sessionStorage.setItem(draftKey, JSON.stringify({ version: 1, savedAt: Date.now(), state: { ...state, schedule: { ...state.schedule, access_method: '' } } }));
    } catch { /* Booking still works with storage disabled. */ }
  }, [state, restored, done, draftKey]);

  const totalDuration = useMemo(() => {
    return (
      state.items.reduce((sum, it) => {
        const p = products.find((x) => x.id === it.product_id);
        return sum + (p?.duration_minutes ?? 0) * it.quantity;
      }, 0) || 60
    );
  }, [state.items, products]);

  const goto = (step: BookingState['step']) => setState((s) => ({ ...s, step }));

  function changeItems(items: SelectedItem[]) {
    setState((s) => ({ ...s, items, step: 3, schedule: { ...s.schedule, scheduled_at: null, photographer_id: null } }));
    setError(null);
  }

  const selectedProducts = products.filter((product) => state.items.some((item) => item.product_id === product.id));
  const total = state.items.reduce((sum, item) => sum + (products.find((product) => product.id === item.product_id)?.price_cents ?? 0) * item.quantity, 0);
  const validSelection = state.items.length > 0 && selectedProducts.length === state.items.length && !selectionProblem(selectedProducts);

  async function submitBooking(contact: typeof state.contact) {
    if (!validSelection) {
      setError(selectionProblem(selectedProducts) || 'Please choose your services before submitting your booking.');
      setState((s) => ({ ...s, contact, step: 3 }));
      return;
    }
    if (!state.address || !state.schedule.scheduled_at) return;
    setState(s => ({ ...s, contact }));
    setSubmitting(true);
    setError(null);
    try {
      const body = JSON.stringify({
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
        });
      if (!requestKey.current || requestKey.current.body !== body) {
        requestKey.current = { body, key: crypto.randomUUID() };
      }
      const r = await fetch('/api/booking/v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': requestKey.current.key },
        body,
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.message || 'We could not confirm your booking. Please try again.');
        if (data.error === 'slot_unavailable' || data.error === 'availability_unavailable') {
          setState(s => ({ ...s, contact, step: 4, schedule: { ...s.schedule, scheduled_at: null, photographer_id: null } }));
        } else if (data.error === 'invalid_product' || data.error === 'invalid_selection') {
          setState(s => ({ ...s, contact, step: 3 }));
        }
      } else {
        try { sessionStorage.removeItem(draftKey); } catch {}
        setDone({ orderId: data.order_id, pending: data.assignment_state === 'awaiting_response' });
        setState((s) => ({ ...s, step: 5, contact }));
      }
    } catch {
      setError('We could not confirm whether your booking went through. Please try again with the same details. This will not create a duplicate booking.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 px-6">
        <div className="card max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-semibold text-ocean-900">{done.pending ? 'Time reserved' : 'Booking confirmed'}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {done.pending ? 'We’ve reserved your requested time for ' : 'Thanks! Your shoot is booked for '}
            <strong>{fmtDateTimeTz(state.schedule.scheduled_at!, state.schedule.timezone)} {new Intl.DateTimeFormat('en-US', { timeZone: state.schedule.timezone, timeZoneName: 'short' }).formatToParts(new Date(state.schedule.scheduled_at!)).find((part) => part.type === 'timeZoneName')?.value}</strong> at{' '}
            <strong>{state.address ? fmtAddress(state.address) : ''}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {done.pending ? 'We’re checking with your photographer. We’ll email your final confirmation once they accept.' : 'We’ll send a confirmation email shortly.'}
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
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
          <div className="flex items-center justify-between gap-3 xl:justify-start">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <BrandLogo variant="dark" className="h-7 w-auto shrink-0" />
              {label && (
                <span className="hidden sm:inline border-l border-slate-200 pl-3 text-sm font-medium text-slate-500">
                  {label}
                </span>
              )}
            </Link>
            {/* Returning clients: /portal signs them in or drops them straight
                into their listings, galleries, and invoices. */}
            <Link
              href="/portal"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ocean-700 ring-1 ring-ocean-200 transition hover:bg-ocean-50 xl:hidden"
            >
              <UserRound className="h-4 w-4" /> Client portal
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <StepHeader current={state.step} />
            <Link
              href="/portal"
              className="hidden shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ocean-700 ring-1 ring-ocean-200 transition hover:bg-ocean-50 xl:inline-flex"
            >
              <UserRound className="h-4 w-4" /> Client portal
            </Link>
          </div>
        </div>
      </header>

      <main ref={main} tabIndex={-1} className={`mx-auto max-w-6xl px-4 sm:px-6 py-8 outline-none ${state.step === 3 ? 'pb-28 lg:pb-8' : ''}`}>
        {error && state.step !== 5 && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-amber-900">{error}</p>}
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
            onComplete={(a, p) => setState((s) => ({ ...s, address: a, property: p, step: 3, schedule: { ...s.schedule, scheduled_at: null, photographer_id: null } }))}
          />
        )}

        {state.step === 3 && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ProductsStep
              sqft={state.property.sqft}
              audience={audience}
              items={state.items}
              onBack={() => goto(2)}
              onChange={changeItems}
              onComplete={() => { if (validSelection) goto(4); }}
              onLoaded={setProducts}
            />
            <OrderSummary
              state={state}
              products={products}
              onEditAddress={() => goto(2)}
              onRemoveItem={(id) => changeItems(state.items.filter((i) => i.product_id !== id))}
            />
          </div>
        )}

        {state.step === 4 && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ScheduleStep
              schedule={state.schedule}
              totalDuration={totalDuration}
              productIds={state.items.map(i=>i.product_id).join(',')}
              zip={state.address?.zip || ''}
              onBack={() => goto(3)}
              onComplete={(schedule) => setState((s) => ({ ...s, schedule, step: validSelection ? 5 : 3 }))}
            />
            <OrderSummary
              state={state}
              products={products}
              onEditAddress={() => goto(2)}
              onEditServices={() => goto(3)}
              onRemoveItem={(id) => changeItems(state.items.filter((i) => i.product_id !== id))}
            />
          </div>
        )}

        {state.step === 5 && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1">
              <OrderSummary
                state={state}
                products={products}
                onEditAddress={submitting ? undefined : () => goto(2)}
                onEditSchedule={submitting ? undefined : () => goto(4)}
                onEditServices={submitting ? undefined : () => goto(3)}
              />
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <ContactStep
                contact={state.contact}
                onChange={(contact) => setState((s) => ({ ...s, contact }))}
                onBack={() => goto(4)}
                onSubmit={submitBooking}
                submitting={submitting}
                error={error}
              />
            </div>
          </div>
        )}
      </main>
      {state.step === 3 && state.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-soft lg:hidden">
          <div aria-live="polite" aria-atomic="true" className="text-sm text-slate-600">Your total <strong className="block text-lg text-ocean-950">{selectedProducts.length === state.items.length ? fmtCents(total) : 'Loading…'}</strong></div>
          <a className="btn-secondary" href="#booking-summary">Review services</a>
        </div>
      )}
    </div>
  );
}
