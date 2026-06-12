'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Home,
  Users,
  Image as ImageIcon,
  Package,
  Settings,
  Gauge,
  FolderKanban,
  Briefcase,
  Boxes,
  Workflow,
  MessageSquare,
  Zap,
  Plug,
  Send,
  Sparkles,
  Mic,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

// Production OS — the new universal operating system.
const PRODUCTION_OS: NavItem[] = [
  { href: '/dashboard/command-center', label: 'Command Center', icon: Gauge },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/podcasts', label: 'Podcasts', icon: Mic },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/assets', label: 'Assets', icon: Boxes },
  { href: '/dashboard/workers', label: 'Workers', icon: HardDrive },
  { href: '/dashboard/workflows', label: 'Workflows', icon: Workflow },
  { href: '/dashboard/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/dashboard/automations', label: 'Automations', icon: Zap },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { href: '/dashboard/deliveries', label: 'Deliveries', icon: Send },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

// Existing real estate photography module — preserved.
const REAL_ESTATE: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList },
  { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/dashboard/listings', label: 'Listings', icon: Home },
  { href: '/dashboard/photos', label: 'Photos', icon: ImageIcon },
  { href: '/dashboard/photo-rescue', label: 'Photo Rescue', icon: Sparkles },
  { href: '/dashboard/products', label: 'Products', icon: Package },
];

function NavGroup({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="px-3 pt-5 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
        {title}
      </div>
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-swift',
              active
                ? 'bg-white/10 text-white'
                : 'text-ink-300 hover:bg-white/5 hover:text-white hover:translate-x-0.5'
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-ocean-400 transition-all duration-300 ease-spring',
                active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'
              )}
            />
            <Icon
              className={cn(
                'h-4 w-4 transition-colors duration-200',
                active ? 'text-ocean-400' : 'text-ink-400 group-hover:text-ocean-300'
              )}
            />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col bg-ink-950 text-white">
      <div className="px-5 py-6">
        <Link href="/dashboard/command-center" className="group flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-ocean-400 to-ocean-700 font-display text-lg font-bold text-white shadow-glow transition-transform duration-300 ease-spring group-hover:scale-105 group-hover:rotate-3">
            O
          </div>
          <div>
            <div className="font-display text-[15px] font-semibold tracking-tight text-white">
              Oceano Blue
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
              Production OS
            </div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <NavGroup title="Production OS" items={PRODUCTION_OS} pathname={pathname} />
        <NavGroup title="Real Estate" items={REAL_ESTATE} pathname={pathname} />
      </nav>
      <div className="border-t border-white/10 px-5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
        Oceano Blue Media
      </div>
    </aside>
  );
}
