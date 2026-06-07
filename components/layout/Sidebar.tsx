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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

// Production OS — the new universal operating system.
const PRODUCTION_OS: NavItem[] = [
  { href: '/dashboard/command-center', label: 'Command Center', icon: Gauge },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
  { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/assets', label: 'Assets', icon: Boxes },
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
    <div className="space-y-1">
      <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
              active
                ? 'bg-ocean-50 text-ocean-900'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4" />
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
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-slate-200 bg-white">
      <div className="px-6 py-5">
        <Link href="/dashboard/command-center" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-ocean-700 grid place-items-center text-white font-bold">O</div>
          <div>
            <div className="text-sm font-semibold text-ocean-950">Oceano Blue</div>
            <div className="text-xs text-slate-500">Production OS</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <NavGroup title="Production OS" items={PRODUCTION_OS} pathname={pathname} />
        <NavGroup title="Real Estate" items={REAL_ESTATE} pathname={pathname} />
      </nav>
    </aside>
  );
}
