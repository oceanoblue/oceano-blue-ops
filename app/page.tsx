import { SiteShell } from '@/components/site/SiteShell';
import { Hero } from '@/components/home/Hero';
import { ClientStrip } from '@/components/home/ClientStrip';
import { ScrollManifesto } from '@/components/home/ScrollManifesto';
import { Services } from '@/components/home/Services';
import { FeaturedWork } from '@/components/home/FeaturedWork';
import { Gallery } from '@/components/home/Gallery';
import { ScrollScrubStudio } from '@/components/home/ScrollScrubStudio';
import { Studio } from '@/components/home/Studio';
import { Showreel } from '@/components/home/Showreel';
import { Stats } from '@/components/home/Stats';
import { Process } from '@/components/home/Process';
import { Capabilities } from '@/components/home/Capabilities';
import { Testimonials } from '@/components/home/Testimonials';
import { Faq } from '@/components/home/Faq';
import { Contact } from '@/components/home/Contact';

export default function HomePage() {
  return (
    <SiteShell preloader>
      <Hero />
      <ClientStrip />
      <ScrollManifesto />
      <Services />
      <FeaturedWork />
      <Gallery />
      <ScrollScrubStudio />
      <Studio />
      <Showreel />
      <Stats />
      <Process />
      <Capabilities />
      <Testimonials />
      <Faq />
      <Contact />
    </SiteShell>
  );
}
