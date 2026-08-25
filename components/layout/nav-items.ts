import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Home,
  Users,
  Users2,
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
  LifeBuoy,
  Send,
  Sparkles,
  Mic,
  HardDrive,
  Camera,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type NavGroupDef = {
  title: string;
  items: NavItem[];
  /** Collapsed by default (still one click away). */
  collapsible?: boolean;
};

/**
 * Navigation IA, redesigned around the actual daily workflow.
 *
 * The old nav listed 13 "Production OS" modules ABOVE the real-estate flow the
 * team lives in all day — the same too-many-options friction the photo UI had.
 * Order now follows frequency of use: the work you touch hourly first, the
 * libraries you reference sometimes second, and platform/system modules last
 * (collapsed by default, one click away, nothing removed).
 */
export const NAV_GROUPS: NavGroupDef[] = [
  {
    title: 'Today',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList },
      { href: '/dashboard/schedule', label: 'Schedule', icon: CalendarDays },
    ],
  },
  {
    title: 'Production',
    items: [
      { href: '/dashboard/photos', label: 'Photos', icon: ImageIcon },
      { href: '/dashboard/photo-rescue', label: 'Photo Production', icon: Sparkles },
      { href: '/dashboard/podcasts', label: 'Podcasts', icon: Mic },
      { href: '/dashboard/jobs', label: 'Jobs', icon: Briefcase },
      { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
      { href: '/dashboard/deliveries', label: 'Deliveries', icon: Send },
      { href: '/dashboard/reviews', label: 'Reviews', icon: MessageSquare },
    ],
  },
  {
    title: 'Library',
    items: [
      { href: '/dashboard/listings', label: 'Listings', icon: Home },
      { href: '/dashboard/clients', label: 'Clients', icon: Users },
      { href: '/dashboard/contractors', label: 'Photographers', icon: Camera },
      { href: '/dashboard/team', label: 'Team', icon: Users2 },
      { href: '/dashboard/assets', label: 'Assets', icon: Boxes },
      { href: '/dashboard/products', label: 'Products', icon: Package },
    ],
  },
  {
    title: 'System',
    collapsible: true,
    items: [
      { href: '/dashboard/command-center', label: 'Command Center', icon: Gauge },
      { href: '/dashboard/workers', label: 'Workers', icon: HardDrive },
      { href: '/dashboard/workflows', label: 'Workflows', icon: Workflow },
      { href: '/dashboard/automations', label: 'Automations', icon: Zap },
      { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
      { href: '/dashboard/help', label: 'Help & Guides', icon: LifeBuoy },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** True when the item is the current page (or an ancestor of it). */
export function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard'
    ? pathname === '/dashboard'
    : pathname === href || pathname.startsWith(href + '/');
}
