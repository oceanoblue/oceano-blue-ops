import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import { RevealProvider } from '@/components/site/Reveal';
import { SmoothScroll } from '@/components/site/SmoothScroll';
import { Cursor } from '@/components/site/Cursor';
import { Preloader } from '@/components/site/Preloader';
import { ScrollProgress } from '@/components/site/ScrollProgress';
import { Parallax } from '@/components/site/Parallax';
import { Magnetic } from '@/components/site/Magnetic';
import { Hero } from '@/components/home/Hero';
import { ClientStrip } from '@/components/home/ClientStrip';
import { ScrollManifesto } from '@/components/home/ScrollManifesto';
import { Services } from '@/components/home/Services';
import { FeaturedWork } from '@/components/home/FeaturedWork';
import { ScrollScrubStudio } from '@/components/home/ScrollScrubStudio';
import { Studio } from '@/components/home/Studio';
import { Showreel } from '@/components/home/Showreel';
import { Stats } from '@/components/home/Stats';
import { Process } from '@/components/home/Process';
import { Capabilities } from '@/components/home/Capabilities';
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
      <Magnetic />
      <Nav />
      <main>
        <Hero />
        <ClientStrip />
        <ScrollManifesto />
        <Services />
        <FeaturedWork />
        <ScrollScrubStudio />
        <Studio />
        <Showreel />
        <Stats />
        <Process />
        <Capabilities />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
