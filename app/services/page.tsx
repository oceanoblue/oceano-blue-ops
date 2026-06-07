import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { PageHero } from '@/components/site/PageHero';
import { Services } from '@/components/home/Services';
import { Capabilities } from '@/components/home/Capabilities';
import { Process } from '@/components/home/Process';
import { Faq } from '@/components/home/Faq';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Video production, photography, headshots, real estate media, and a podcast studio — full-service visual production from Oceano Blue Media in Bluffton, SC.',
};

export default function ServicesPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Services"
        title={<>Everything you need to <em className="italic">look the part.</em></>}
        intro="One studio, one consistent visual language — from cinematic video and brand photography to headshots, real estate media, and a podcast-ready space."
      />
      <Services />
      <Capabilities />
      <Process />
      <Faq />
    </SiteShell>
  );
}
