'use client';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const STEPS = ['Address', 'Property', 'Products', 'Scheduling', 'Contact'];

export function StepHeader({ current }: { current: number }) {
  return (
    <nav className="flex items-center gap-2 sm:gap-3 overflow-x-auto" aria-label="Progress">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={label} className="flex items-center gap-2 sm:gap-3">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                done && 'bg-ocean-700 text-white',
                active && 'bg-ocean-700 text-white',
                !done && !active && 'bg-slate-200 text-slate-600'
              )}
            >
              {done ? <Check className="h-4 w-4" /> : idx}
            </div>
            <span
              className={cn(
                'text-sm',
                active ? 'font-medium text-ocean-900' : 'text-slate-600',
                !active && !done && 'hidden sm:inline'
              )}
            >
              {label}
            </span>
            {idx < STEPS.length && <div className="h-px w-6 bg-slate-300 sm:w-12" />}
          </div>
        );
      })}
    </nav>
  );
}
