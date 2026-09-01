import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { TableLinkRow } from './TableLinkRow';

/**
 * Generic, card-wrapped data table for dashboard list pages. Replaces the
 * copy-pasted `<div className="card overflow-hidden"><table>…table-head…</table>`
 * boilerplate (headers, dividers, empty/error states, optional clickable rows).
 *
 * Server component: it invokes each column's `cell(row)` renderer server-side,
 * so columns can render anything (links, StatusBadge, formatted values) without
 * the serialization limits of passing functions to a client component. When
 * `rowHref` is given, the whole row becomes navigable (hover-prefetch) via the
 * client TableLinkRow.
 *
 * Sorting: mark a column `sortable` and pass `sort` (the current key+dir) plus
 * `sortHref(key)` (a URL that sorts by that key, toggling direction). Headers
 * become links, so sorting is just navigation — no client state needed.
 */
export interface Column<T> {
  /** Stable key for the column. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes on the <td>. */
  className?: string;
  /** Extra classes on the <th>. */
  headClassName?: string;
  /** Show a sort control on this column's header. */
  sortable?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty = 'Nothing here yet.',
  error,
  sort,
  sortHref,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
  error?: string | null;
  /** Current sort state (drives the header arrow). */
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  /** Builds the URL that sorts by `key` (caller decides direction toggling). */
  sortHref?: (key: string) => string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left">
              {columns.map((c) => {
                const canSort = c.sortable && sortHref;
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={`table-head px-4 py-3 ${c.headClassName ?? ''}`}>
                    {canSort ? (
                      <Link
                        href={sortHref!(c.key)}
                        className={`group inline-flex items-center gap-1 transition-colors hover:text-ocean-700 ${
                          active ? 'text-ocean-800' : ''
                        }`}
                      >
                        {c.header}
                        {active ? (
                          sort!.dir === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
                        )}
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {error && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-rose-600 text-sm">
                  {error}
                </td>
              </tr>
            )}
            {!error && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            )}
            {!error &&
              rows.map((row) => {
                const cells = columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>
                    {c.cell(row)}
                  </td>
                ));
                return rowHref ? (
                  <TableLinkRow key={rowKey(row)} href={rowHref(row)}>
                    {cells}
                  </TableLinkRow>
                ) : (
                  <tr key={rowKey(row)} className="hover:bg-slate-50">
                    {cells}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
