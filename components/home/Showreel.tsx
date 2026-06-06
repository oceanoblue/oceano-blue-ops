import Image from 'next/image';
import { Play } from 'lucide-react';
import { IMAGES } from '@/lib/images';
import { VIDEOS } from '@/lib/images';

export function Showreel() {
  return (
    <section className="relative h-[70svh] min-h-[460px] w-full overflow-hidden bg-ink text-paper">
      {VIDEOS.showreel ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster={IMAGES.studio}
        >
          <source src={VIDEOS.showreel} type="video/mp4" />
        </video>
      ) : (
        <Image src={IMAGES.studio} alt="Inside the Oceano Blue studio" fill sizes="100vw" className="object-cover" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-ink/40" />
      <div className="grain-overlay absolute inset-0 overflow-hidden" />

      <div className="container-edge relative z-10 flex h-full flex-col items-center justify-center text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full border border-paper/40 backdrop-blur-sm transition-transform duration-500 ease-editorial hover:scale-110" data-reveal>
          <Play className="h-7 w-7 translate-x-0.5 fill-paper" />
        </span>
        <h2 className="mt-8 max-w-[18ch] font-display font-light leading-[0.95] tracking-tight text-giant" data-reveal>
          We don&apos;t describe it.
          <br />
          We <em className="italic">show</em> it.
        </h2>
        <p className="mt-5 max-w-md font-grotesk text-sm leading-relaxed text-paper/75" data-reveal>
          Real production value, real cameras, real craft — pressed into every
          second of footage we deliver.
        </p>
      </div>
    </section>
  );
}
