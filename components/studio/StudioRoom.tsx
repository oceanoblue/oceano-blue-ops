import Image from 'next/image';
import { PHOTOS } from '@/lib/images';

const FEATURES = [
  { no: '01', title: 'White-cyc studio', body: 'A clean, seamless backdrop ready for portraits, product, and on-camera interviews.' },
  { no: '02', title: 'Cinema cameras', body: 'Professional cinema bodies and prime glass — the look is filmic, not “corporate video.”' },
  { no: '03', title: 'Real lighting', body: 'A full lighting package and grip kit, so every frame is shaped with intention.' },
  { no: '04', title: 'Podcast-ready', body: 'A treated, multi-mic, multi-cam space you can book by the hour — we run the gear.' },
  { no: '05', title: 'Edit, color & sound', body: 'Cut, graded, and mixed in-house. One team from the first call to final delivery.' },
  { no: '06', title: 'Old Town Bluffton', body: 'Centrally located in the Lowcountry — easy to reach, and we travel for on-location work.' },
];

export function StudioRoom() {
  return (
    <section className="bg-ink py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <div data-reveal>
            <span className="kicker text-ocean-soft">Inside the room</span>
            <h2 className="mt-4 font-display font-light leading-[0.92] tracking-tight text-giant">
              Everything under
              <br />
              <em className="italic">one roof.</em>
            </h2>
            <p className="mt-6 max-w-md font-grotesk text-sm leading-relaxed text-paper/70">
              A purpose-built space for video, photography, and podcasts — plus
              the crew and the gear to make the most of it.
            </p>
          </div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-sm bg-bone/10" data-reveal data-reveal-delay={120}>
            <Image
              src={PHOTOS.podcast}
              alt="The Oceano Blue podcast and content studio"
              fill
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/50 to-transparent" />
          </div>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-sm bg-paper/10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.no}
              className="group bg-ink p-7 transition-colors duration-300 hover:bg-paper hover:text-ink"
              data-reveal
            >
              <span className="font-mono text-[0.65rem] uppercase tracking-kicker text-ocean-soft group-hover:text-ocean">
                {f.no}
              </span>
              <h3 className="mt-5 font-display text-2xl font-light leading-tight tracking-tight">
                {f.title}
              </h3>
              <p className="mt-3 font-grotesk text-sm leading-relaxed text-paper/65 group-hover:text-ink/70">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
