import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck } from "lucide-react";
import {
  balance,
  invoiceStatus,
  money,
  outstandingInvoices,
  type InvoiceOrder,
} from "@/lib/billing/ledger";
import { STATUS_LABEL } from "@/lib/utils/format";

const outstandingHref = "/dashboard/invoices?status=Outstanding";

export function OutstandingInvoices({
  orders,
  today,
}: {
  orders: InvoiceOrder[] | null;
  today: string;
}) {
  const outstanding = orders === null ? null : outstandingInvoices(orders);
  const total = outstanding?.reduce((sum, order) => sum + balance(order), 0) ?? 0;
  const delivered = outstanding?.filter((order) => order.status === "delivered") ?? [];
  const deliveredTotal = delivered.reduce((sum, order) => sum + balance(order), 0);

  return (
    <section
      aria-labelledby="unpaid-orders-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="unpaid-orders-heading" className="text-lg font-semibold text-ink-950">
            Unpaid orders
          </h2>
          <p className="mt-1 text-sm text-slate-500">Real estate order invoices</p>
        </div>
        <Link href={outstandingHref} className="btn-secondary min-h-10 gap-2">
          View all unpaid
          <ArrowUpRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>

      {outstanding === null ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-medium text-amber-950">Payment status could not be loaded</p>
            <p className="mt-1 text-sm text-amber-900">
              <Link href={outstandingHref} className="font-medium underline underline-offset-2">
                Open Invoices
              </Link>{" "}
              to check current balances.
            </p>
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-slate-600">Total outstanding</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink-950">
                {money(total)}
              </dd>
              <dd className="mt-1 text-sm text-slate-500">
                {outstanding.length} unpaid {outstanding.length === 1 ? "order" : "orders"}
              </dd>
            </div>
            <div className="border-t border-slate-200 pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
              <dt className="text-sm font-medium text-slate-600">Delivered and unpaid</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink-950">
                {money(deliveredTotal)}
              </dd>
              <dd className="mt-1 text-sm text-slate-500">
                {delivered.length} delivered {delivered.length === 1 ? "order" : "orders"}
              </dd>
            </div>
          </dl>

          {outstanding.length === 0 ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
              <CircleCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-ink-950">No unpaid order invoices</p>
                <p className="mt-1 text-sm text-slate-500">
                  No outstanding balances are recorded for real estate order invoices.
                </p>
              </div>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {outstanding.slice(0, 5).map((order) => {
                const paymentStatus = invoiceStatus(order, today);
                const progress = STATUS_LABEL[order.status] ??
                  (order.status === "archived" ? "Archived" : order.status);

                return (
                  <li key={order.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-950">
                        {order.listings?.address_line1 || "Property not recorded"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        #{order.order_number} · {order.clients?.full_name || "Client not recorded"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                        <span className="rounded-sm bg-slate-100 px-2 py-1 text-slate-600">
                          {progress}
                        </span>
                        <span className={paymentStatus === "Overdue"
                          ? "rounded-sm bg-rose-50 px-2 py-1 text-rose-700"
                          : "rounded-sm bg-amber-50 px-2 py-1 text-amber-800"}>
                          {paymentStatus}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end">
                      <p className="text-lg font-semibold tabular-nums text-ink-950">
                        {money(balance(order))}
                      </p>
                      <div className="flex items-center gap-3 text-sm font-medium">
                        <Link
                          href={`/dashboard/invoices/${order.id}`}
                          aria-label={`View invoice for order #${order.order_number}`}
                          className="inline-flex min-h-10 items-center text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          View invoice
                        </Link>
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          aria-label={`View details for order #${order.order_number}`}
                          className="inline-flex min-h-10 items-center text-slate-600 hover:text-ink-950 hover:underline"
                        >
                          Order details
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {outstanding.length > 5 && (
            <p className="text-sm text-slate-500">
              Showing 5 of {outstanding.length} unpaid orders. Delivered orders appear first.
            </p>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Delivered orders stay here until a payment is recorded.
      </p>
    </section>
  );
}
