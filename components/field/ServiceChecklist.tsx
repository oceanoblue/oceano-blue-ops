import type { ServiceScope } from '@/lib/field/service-scope';

export function ServiceChecklist({ scope, compact = false }: { scope?: ServiceScope; compact?: boolean }) {
  return <div className={compact ? 'mt-2 space-y-2' : 'rounded-xl border-2 border-ocean-200 bg-ocean-50 p-4'}>
    <p className="text-xs font-bold uppercase tracking-wide text-ocean-900">Required shoot services</p>
    {(scope?.has360 || scope?.hasFloorPlan) && <div className="flex flex-wrap gap-2">
      {scope.has360 && <span className="rounded-md bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">360 Tour</span>}
      {scope.hasFloorPlan && <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">Floor Plan</span>}
    </div>}
    {scope?.labels.length ? <ul className={`${compact ? 'text-xs' : 'mt-3 text-sm'} space-y-1 font-medium text-ink-900`}>
      {scope.labels.map(label => <li key={label} className="break-words">• {label}</li>)}
    </ul> : <p className="text-sm font-medium text-amber-900">Services not specified. Confirm with the office before the shoot.</p>}
    {scope?.splitCrew && <p className="mt-2 text-xs text-slate-600">Video is handled by another crew member.</p>}
    {!compact && <p className="mt-3 text-xs text-ocean-900">Review every service before the shoot and capture each one before leaving the property.</p>}
  </div>;
}
