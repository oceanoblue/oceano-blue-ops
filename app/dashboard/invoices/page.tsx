import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { loadInvoices } from '@/lib/billing/load';
import { InvoiceOverview } from '@/components/billing/InvoiceOverview';
import { parseInvoiceFilter } from '@/lib/billing/ledger';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{status?:string|string[]}>}){ const gate=await requireTeamMember();if(gate.error)notFound();const [orders,search]=await Promise.all([loadInvoices(),searchParams]);return <div className="space-y-6"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Invoices</h1><p className="mt-1 text-sm text-slate-600">Order invoices, payment status, and due dates.</p></div><Link href="/dashboard/reports" className="btn-secondary">Revenue reports</Link></div><InvoiceOverview orders={orders} staff initialStatus={parseInvoiceFilter(search.status)}/></div>;}
