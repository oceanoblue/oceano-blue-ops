import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { fmtDateTime } from '@/lib/utils/format';

/**
 * Office-side surfacing of a contractor's accept/decline on a shoot. A decline
 * is loud (the office must reassign); an accept is a quiet confirmation. Renders
 * nothing until the contractor has responded.
 */
export function ContractorResponseNotice({
  response,
  respondedAt,
  note,
  contractorName,
}: {
  response: string | null;
  respondedAt: string | null;
  note: string | null;
  contractorName?: string | null;
}) {
  if (response === 'declined') {
    return (
      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-rose-800">
          <AlertTriangle className="h-4 w-4" /> {contractorName || 'The photographer'} declined this shoot
        </p>
        {note && <p className="mt-1 text-sm text-rose-700">“{note}”</p>}
        <p className="mt-1 text-xs text-rose-600">
          {respondedAt ? `${fmtDateTime(respondedAt)} · ` : ''}reassign it to another photographer above.
        </p>
      </div>
    );
  }
  if (response === 'accepted') {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Accepted{respondedAt ? ` · ${fmtDateTime(respondedAt)}` : ''}
      </p>
    );
  }
  return null;
}
