import { Asterisk } from 'lucide-react';

export function Marquee({
  items,
  className = '',
  speed = 'normal',
}: {
  items: string[];
  className?: string;
  speed?: 'normal' | 'slow';
}) {
  const loop = [...items, ...items];
  return (
    <div className={`group relative flex overflow-hidden ${className}`}>
      <div
        className={`flex shrink-0 items-center ${
          speed === 'slow' ? 'animate-marquee-slow' : 'animate-marquee'
        } group-hover:[animation-play-state:paused]`}
      >
        {loop.map((item, i) => (
          <span key={i} className="flex items-center whitespace-nowrap">
            <span className="px-6 font-display text-3xl font-light tracking-tight sm:text-4xl md:text-5xl">
              {item}
            </span>
            <Asterisk className="h-5 w-5 shrink-0 opacity-40" />
          </span>
        ))}
      </div>
    </div>
  );
}
