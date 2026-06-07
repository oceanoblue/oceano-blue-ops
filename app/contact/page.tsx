import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { Contact } from '@/components/home/Contact';
import { Faq } from '@/components/home/Faq';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Start a project with Oceano Blue Media. Free consultation, custom proposal, no pressure. Bluffton, SC — (843) 505-8586 · info@oceanoblue.net.',
};

export default function ContactPage() {
  return (
    <SiteShell>
      <div className="bg-ink pt-16 sm:pt-20">
        <Contact />
      </div>
      <Faq />
    </SiteShell>
  );
}
