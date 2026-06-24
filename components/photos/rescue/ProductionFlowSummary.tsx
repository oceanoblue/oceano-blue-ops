import { CheckCircle2, Circle, Image, Layers, Wand2, ClipboardCheck } from 'lucide-react';

export type ProductionFlowCounts = {
  sources: number;
  groups: number;
  groupsNeedingReview: number;
  singles: number;
  outputs: number;
  qcStatus: string | null;
};

function Step({
  icon: Icon,
  label,
  value,
  state,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  state: 'done' | 'active' | 'waiting';
}) {
  const done = state === 'done';
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2">
      <div className={done ? 'text-emerald-600' : state === 'active' ? 'text-ocean-700' : 'text-slate-300'}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-900">{label}</div>
        <div className="truncate text-[11px] text-slate-500">{value}</div>
      </div>
    </div>
  );
}

export function ProductionFlowSummary({ counts }: { counts: ProductionFlowCounts }) {
  const hasSources = counts.sources > 0;
  const hasOpenGrouping = counts.groupsNeedingReview > 0 || counts.singles > 0;
  const groupingDone = hasSources && counts.groups > 0 && !hasOpenGrouping;
  const hasOutputs = counts.outputs > 0;
  const qcDone = counts.qcStatus === 'passed';

  return (
    <div className="grid gap-2 md:grid-cols-5">
      <Step
        icon={Image}
        label="Sources"
        value={`${counts.sources} file${counts.sources === 1 ? '' : 's'}`}
        state={hasSources ? 'done' : 'active'}
      />
      <Step
        icon={Layers}
        label="Bracket Sets"
        value={`${counts.groups} set${counts.groups === 1 ? '' : 's'} · ${counts.groupsNeedingReview} review`}
        state={groupingDone ? 'done' : hasSources ? 'active' : 'waiting'}
      />
      <Step
        icon={Circle}
        label="Singles"
        value={`${counts.singles} ungrouped`}
        state={counts.singles === 0 && hasSources ? 'done' : hasSources ? 'active' : 'waiting'}
      />
      <Step
        icon={Wand2}
        label="Processed"
        value={`${counts.outputs} output${counts.outputs === 1 ? '' : 's'}`}
        state={hasOutputs ? 'done' : groupingDone ? 'active' : 'waiting'}
      />
      <Step
        icon={ClipboardCheck}
        label="QC"
        value={counts.qcStatus ? counts.qcStatus.replace(/_/g, ' ') : 'not run'}
        state={qcDone ? 'done' : hasOutputs ? 'active' : 'waiting'}
      />
    </div>
  );
}
