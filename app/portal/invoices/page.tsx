import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireClientIds } from '@/lib/portal/require-client';
import { loadInvoices } from '@/lib/billing/load';
import { InvoiceOverview } from '@/components/billing/InvoiceOverview';
import { PortalHero } from '@/components/portal/PortalHero';
import { NotAClient } from '@/components/portal/NotAClient';
export const dynamic='force-dynamic';
export default async function Page(){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/portal');const ids=await requireClientIds(db,user.id);if(!ids.length)return <NotAClient/>;const orders=await loadInvoices(ids);return <div className="min-h-screen bg-slate-50"><PortalHero title="Your invoices" subtitle="View balances, print invoices, and open payment links." backHref="/portal/listings" backLabel="Your listings"/><main className="mx-auto max-w-6xl p-6"><InvoiceOverview orders={orders}/></main></div>;}
