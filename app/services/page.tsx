import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { PageHero } from '@/components/site/PageHero';
import { ServiceDeepDive } from '@/components/services/ServiceDeepDive';
import { CtaBand } from '@/components/site/CtaBand';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Video production, photography, headshots, real estate & architecture media, and a podcast studio — full-service visual production from Oceano Blue Media in Bluffton, SC.',
};

export default function ServicesPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Services"
        title={<>Everything you need to <em className="italic">look the part.</em></>}
        intro="One studio, one consistent visual language — from cinematic video and brand photography to headshots, real estate media, and a podcast-ready space."
      />
      <ServiceDeepDive />
      <CtaBand
        title={<>Not sure where to <em className="italic text-ocean-soft">start?</em></>}
        body="Tell us what you’re trying to accomplish and we’ll recommend the right mix — no pressure, no obligation."
      />
    </SiteShell>
  );
}
