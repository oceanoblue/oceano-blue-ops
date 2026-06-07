import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { PageHero } from '@/components/site/PageHero';
import { StudioStory } from '@/components/studio/StudioStory';
import { StudioRoom } from '@/components/studio/StudioRoom';
import { CtaBand } from '@/components/site/CtaBand';

export const metadata: Metadata = {
  title: 'Studio',
  description:
    'Meet Oceano Blue Media — a hands-on visual production studio in Old Town Bluffton, SC, with cinema cameras, real lighting, and a podcast-ready space under one roof.',
};

export default function StudioPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="The Studio"
        title={<>A studio built for <em className="italic">storytelling.</em></>}
        intro="A hands-on video & photography studio in Old Town Bluffton — cinema cameras, real lighting, and a podcast-ready space, all run by the people you actually work with."
      />
      <StudioStory />
      <StudioRoom />
      <CtaBand
        kicker="Visit the studio"
        title={<>Come make something <em className="italic text-ocean-soft">in the room.</em></>}
        body="Book the space, plan a shoot, or just tour the studio — we’d love to show you around."
      />
    </SiteShell>
  );
}
