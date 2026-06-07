import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { PageHero } from '@/components/site/PageHero';
import { Studio } from '@/components/home/Studio';
import { ScrollScrubStudio } from '@/components/home/ScrollScrubStudio';
import { Stats } from '@/components/home/Stats';
import { Testimonials } from '@/components/home/Testimonials';

export const metadata: Metadata = {
  title: 'Studio',
  description:
    'Meet Oceano Blue Media — a visual production studio in Old Town Bluffton, SC, helping organizations communicate clearly through video and visual storytelling.',
};

export default function StudioPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="The Studio"
        title={<>A studio built for <em className="italic">storytelling.</em></>}
        intro="Oceano Blue Media is a hands-on visual production studio in Old Town Bluffton — cinema cameras, real lighting, and a podcast-ready space, all under one roof."
      />
      <Studio />
      <ScrollScrubStudio />
      <Stats />
      <Testimonials />
    </SiteShell>
  );
}
