import Image from 'next/image';
import { SHOWCASE, WHY } from '@/lib/content';

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
            <span className="kicker text-ocean">Why work with us</span>
            <h2 className="mt-4 font-display font-light leading-[0.9] tracking-tight text-giant">
              Every project gets our
              <br />
              <em className="italic">full weight.</em>
            </h2>
          </div>
          <p className="max-w-xs font-grotesk text-sm leading-relaxed opacity-70">
            Experience, tools, and creative vision — on every brief, large or
            small.
          </p>
        </div>

        <div className="mt-12 grid auto-rows-[minmax(150px,1fr)] grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
          <ImageCell src={SHOWCASE.aerial} label="Architectural & aerial" className="col-span-2 row-span-2" />
          <TextCell kbd="01" title={WHY[0].title} body={WHY[0].body} />
          <div className="flex flex-col justify-between gap-6 rounded-sm bg-ocean p-6 text-white" data-reveal>
            <span className="font-mono text-[0.65rem] uppercase tracking-kicker text-white/70">Trusted by</span>
            <div>
              <div className="font-display text-5xl font-light leading-none tracking-tight">16+</div>
              <p className="mt-2 font-grotesk text-sm text-white/80">Brands across SC &amp; GA.</p>
            </div>
          </div>
          <TextCell kbd="02" title={WHY[1].title} body={WHY[1].body} />
          <TextCell kbd="03" title={WHY[2].title} body={WHY[2].body} />
          <ImageCell src={SHOWCASE.event} label="Events & corporate" className="col-span-2" />
          <TextCell kbd="Air" title="Aerial & drone" body="Ground and sky, one team." />
          <TextCell kbd="Finish" title="Color & sound" body="Graded and mixed in-house." />
        </div>
      </div>
    </section>
  );
}
