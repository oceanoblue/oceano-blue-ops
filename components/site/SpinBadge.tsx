'use client';

import { useId } from 'react';
import { ArrowUpRight } from 'lucide-react';

export function SpinBadge({
  href = '#contact',
  text = 'Let’s make something unforgettable • Oceano Blue • ',
  className = '',
  tone = 'light',
}: {
  href?: string;
  text?: string;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const id = useId().replace(/:/g, '');
  const color = tone === 'light' ? 'text-paper' : 'text-ink';

  return (
    <a
      href={href}
      data-cursor
      className={`group relative inline-grid aspect-square place-items-center ${color} ${className}`}
      aria-label="Start a project"
    >
      <svg viewBox="0 0 200 200" className="spin-badge h-full w-full">
        <defs>
          <path
            id={`circle-${id}`}
            d="M 100,100 m -74,0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0"
            fill="none"
          />
        </defs>
        <text className="fill-current font-mono uppercase" fontSize="11" letterSpacing="3.5">
          <textPath href={`#circle-${id}`} startOffset="0">
            {text}
          </textPath>
        </text>
      </svg>
      <span className="absolute grid h-12 w-12 place-items-center rounded-full bg-ocean text-white transition-transform duration-500 ease-editorial group-hover:scale-110">
        <ArrowUpRight className="h-6 w-6" />
      </span>
    </a>
  );
}
