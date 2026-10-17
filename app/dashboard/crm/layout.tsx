import { CrmNavigation } from "@/components/crm/CrmNavigation";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <CrmNavigation />
      {children}
    </div>
  );
}
