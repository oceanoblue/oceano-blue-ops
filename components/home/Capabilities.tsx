import Image from 'next/image';
import { IMAGES } from '@/lib/images';

function TextCell({ kbd, title, body }: { kbd: string; title: string; body?: string }) {
  return (
    <div
      className="group flex flex-col justify-between gap-6 rounded-sm border border-ink/12 bg-bone/40 p-6 transition-colors duration-300 hover:bg-ink hover:text-paper"
      data-reveal
    >
      <span className="font-mono text-[0.65rem] uppercase tracking-kicker opacity-50 group-hover:opacity-80">
        {kbd}
      </span>
      <div>
        <h3 className="font-display text-2xl font-light leading-tight tracking-tight">{title}</h3>
        {body && <p className="mt-2 font-grotesk text-sm leading-relaxed opacity-70">{body}</p>}
      </div>
    </div>
  );
}

function ImageCell({ src, label, className = '' }: { src: string; label: string; className?: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-sm bg-bone ${className}`} data-reveal>
      <Image src={src} alt={label} fill sizes="50vw" className="object-cover transition-transform duration-[1.2s] ease-editorial group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
      <span className="absolute bottom-5 left-5 font-display text-2xl font-light text-paper sm:text-3xl">{label}</span>
    </div>
  );
}

export function Capabilities() {
  return (
    <section className="bg-paper py-20 sm:py-28">
      <div className="container-edge">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-reveal>
          <div>
            <span className="kicker text-ocean">The edge</span>
            <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
              Cinema-grade,
              <br />
              <em className="italic">end to end.</em>
            </h2>
          </div>
          <p className="max-w-xs font-grotesk text-sm leading-relaxed opacity-70">
            One team, the right gear, and a process that gets you something
            extraordinary — fast.
          </p>
        </div>

        <div className="mt-12 grid auto-rows-[minmax(150px,1fr)] grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
          <ImageCell src={IMAGES.studioDetail} label="Inside the kit" className="col-span-2 row-span-2" />
          <TextCell kbd="Capture" title="4K cinema cameras" body="Pro bodies & cine glass." />
          <div className="flex flex-col justify-between gap-6 rounded-sm bg-ocean p-6 text-white" data-reveal>
            <span className="font-mono text-[0.65rem] uppercase tracking-kicker text-white/70">Turnaround</span>
            <div>
              <div className="font-display text-5xl font-light leading-none tracking-tight">48h</div>
              <p className="mt-2 font-grotesk text-sm text-white/80">Typical edit delivery.</p>
            </div>
          </div>
          <TextCell kbd="Air" title="Aerial & drone" body="Sweeping coverage on demand." />
          <TextCell kbd="Finish" title="Color & sound" body="Graded and mixed in-house." />
          <ImageCell src={IMAGES.podcast} label="Podcast studio" className="col-span-2" />
          <TextCell kbd="Set" title="Lighting & grip" body="Teleprompter-ready." />
          <TextCell kbd="Reach" title="Lowcountry-based" body="Travel-ready, beyond." />
        </div>
      </div>
    </section>
  );
}
