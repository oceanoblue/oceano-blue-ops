import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import { RevealProvider } from '@/components/site/Reveal';
import { SmoothScroll } from '@/components/site/SmoothScroll';
import { Cursor } from '@/components/site/Cursor';
import { Preloader } from '@/components/site/Preloader';
import { ScrollProgress } from '@/components/site/ScrollProgress';
import { Parallax } from '@/components/site/Parallax';
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
      <Preloader />
      <SmoothScroll />
      <Cursor />
      <ScrollProgress />
      <RevealProvider />
      <Parallax />
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
