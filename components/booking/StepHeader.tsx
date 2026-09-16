'use client';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const STEPS = ['Address', 'Property', 'Products', 'Scheduling', 'Contact'];

export function StepHeader({ current }: { current: number }) {
  return (
    <nav className="min-w-0 w-full xl:w-auto" aria-label="Progress">
      <ol className="grid grid-cols-5 gap-1 xl:flex xl:items-center xl:gap-2">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="flex min-w-0 flex-col items-center gap-1.5 xl:flex-row xl:gap-2">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                done && 'bg-ocean-700 text-white',
                active && 'bg-ocean-700 text-white',
                !done && !active && 'bg-slate-200 text-slate-600'
              )}
            >
              {done ? <Check className="h-4 w-4" /> : idx}
            </div>
            <span
              className={cn(
                'whitespace-nowrap text-[10px] sm:text-xs xl:text-sm',
                active ? 'font-medium text-ocean-900' : 'text-slate-600'
              )}
            >
              {label}
            </span>
            {idx < STEPS.length && <div aria-hidden="true" className="hidden h-px w-4 shrink-0 bg-slate-300 xl:block" />}
          </li>
        );
      })}
      </ol>
    </nav>
  );
}
