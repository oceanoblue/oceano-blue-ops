import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import { RevealProvider } from '@/components/site/Reveal';
import { Hero } from '@/components/home/Hero';
import { ClientStrip } from '@/components/home/ClientStrip';
import { Services } from '@/components/home/Services';
import { FeaturedWork } from '@/components/home/FeaturedWork';
import { Studio } from '@/components/home/Studio';
import { Showreel } from '@/components/home/Showreel';
import { Stats } from '@/components/home/Stats';
import { Process } from '@/components/home/Process';
import { Contact } from '@/components/home/Contact';

export default function HomePage() {
  return (
    <>
      <RevealProvider />
      <Nav />
      <main>
        <Hero />
        <ClientStrip />
        <Services />
        <FeaturedWork />
        <Studio />
        <Showreel />
        <Stats />
        <Process />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
