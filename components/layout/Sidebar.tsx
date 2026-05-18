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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList },
  { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/dashboard/listings', label: 'Listings', icon: Home },
  { href: '/dashboard/photos', label: 'Photos', icon: ImageIcon },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/products', label: 'Products', icon: Package },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r border-slate-200 bg-white">
      <div className="px-6 py-5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-ocean-700 grid place-items-center text-white font-bold">O</div>
          <div>
            <div className="text-sm font-semibold text-ocean-950">Oceano Blue</div>
            <div className="text-xs text-slate-500">Operations</div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
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
      </nav>
    </aside>
  );
}
