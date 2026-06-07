'use client';

import { Nav } from '@/components/site/Nav';
import { Footer } from '@/components/site/Footer';
import { RevealProvider } from '@/components/site/Reveal';
import { SmoothScroll } from '@/components/site/SmoothScroll';
import { Cursor } from '@/components/site/Cursor';
import { ScrollProgress } from '@/components/site/ScrollProgress';
import { Parallax } from '@/components/site/Parallax';
import { Magnetic } from '@/components/site/Magnetic';
import { Preloader } from '@/components/site/Preloader';

export function SiteShell({
  children,
  preloader = false,
}: {
  children: React.ReactNode;
  preloader?: boolean;
}) {
  return (
    <>
      {preloader && <Preloader />}
      <SmoothScroll />
      <Cursor />
      <ScrollProgress />
      <RevealProvider />
      <Parallax />
      <Magnetic />
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  );
}
