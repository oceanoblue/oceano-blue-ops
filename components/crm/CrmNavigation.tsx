"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CreditCard, ClipboardCheck, Users, Workflow } from "lucide-react";

const sections = [
  { href: "/dashboard/crm", label: "Relationships", icon: Users },
  { href: "/dashboard/crm/acquisition", label: "Emails & client files", icon: Workflow },
  { href: "/dashboard/crm/scheduling", label: "Scheduling", icon: CalendarDays },
  { href: "/dashboard/crm/billing", label: "Project payments", icon: CreditCard },
  { href: "/dashboard/crm/migration", label: "Migration audit", icon: ClipboardCheck },
];
export function CrmNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Client operations" className="flex gap-2 overflow-x-auto pb-1">
      {sections.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard/crm" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-500 ${active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ocean-300 hover:bg-ocean-50"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
