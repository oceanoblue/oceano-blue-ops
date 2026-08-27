import { LifeBuoy } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { GuideCards, HelpFootnote } from '@/components/help/GuideCards';

export const dynamic = 'force-dynamic';

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        icon={LifeBuoy}
        title="Help & Guides"
        subtitle="Branded walkthroughs for everyone who touches the platform — you, your realtors, and your photographers."
      />
      <GuideCards />
      <HelpFootnote />
    </div>
  );
}
