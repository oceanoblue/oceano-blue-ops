import { Marquee } from '@/components/site/Marquee';
import { CLIENT_TYPES } from '@/lib/content';

export function ClientStrip() {
  return (
    <section className="border-b border-ink/15 bg-paper py-6">
      <div className="container-edge mb-4">
        <span className="kicker opacity-50">Trusted across the Lowcountry by</span>
      </div>
      <Marquee items={CLIENT_TYPES} />
    </section>
  );
}
