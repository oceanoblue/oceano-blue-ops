'use client';

import { useEffect } from 'react';
import { SITE } from '@/lib/content';

const HB_SCRIPT =
  'https://widget.honeybook.com/assets_users_production/websiteplacements/placement-controller.min.js';

export function Contact() {
  const pid = SITE.honeybookPid;

  useEffect(() => {
    // Initialize HoneyBook placement (mirrors their official embed snippet).
    const w = window as typeof window & { _HB_?: { pid?: string } };
    w._HB_ = w._HB_ || {};
    w._HB_.pid = pid;

    if (!document.querySelector(`script[src="${HB_SCRIPT}"]`)) {
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = HB_SCRIPT;
      document.body.appendChild(s);
    }
  }, [pid]);

  return (
    <section id="contact" className="bg-ink py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div className="grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          {/* Statement + details */}
          <div data-reveal>
            <span className="kicker text-ocean-soft">Let&apos;s talk</span>
            <h2 className="mt-5 font-display font-light leading-[0.9] tracking-tight text-giant">
              Let&apos;s make
              <br />
              something
              <br />
              <em className="italic text-ocean-soft">unforgettable.</em>
            </h2>

            <p className="mt-8 max-w-md font-grotesk text-base leading-relaxed text-paper/70">
              Tell us about your project and we&apos;ll be in touch within one
              business day. Prefer to talk it through? Call or email the studio
              directly.
            </p>

            <div className="mt-12 space-y-6">
              <a href={SITE.phoneHref} className="group block">
                <div className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50">
                  Call the studio
                </div>
                <div className="mt-1 font-display text-3xl font-light tracking-tight group-hover:text-ocean-soft sm:text-4xl">
                  {SITE.phone}
                </div>
              </a>
              <a href={SITE.emailHref} className="group block">
                <div className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50">
                  Email us
                </div>
                <div className="mt-1 font-display text-3xl font-light tracking-tight group-hover:text-ocean-soft sm:text-4xl">
                  {SITE.email}
                </div>
              </a>
              <div>
                <div className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50">
                  Find us
                </div>
                <div className="mt-1 font-grotesk text-lg text-paper/85">
                  {SITE.location} — {SITE.region}
                </div>
              </div>
            </div>
          </div>

          {/* HoneyBook inquiry form (native placement) */}
          <div
            className="border-t border-paper/15 pt-10 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0"
            data-reveal
            data-reveal-delay={120}
          >
            <div className="rounded-lg bg-paper p-3 text-ink shadow-2xl sm:p-5">
              <div className={`hb-p-${pid}-2`} />
              <noscript>
                <p className="p-6 text-center font-grotesk text-sm text-ink/70">
                  Please enable JavaScript to load the inquiry form, or email us
                  at {SITE.email}.
                </p>
              </noscript>
            </div>
            <img
              height={1}
              width={1}
              alt=""
              style={{ display: 'none' }}
              src={`https://www.honeybook.com/p.png?pid=${pid}`}
            />
            <p className="mt-4 font-mono text-[0.65rem] leading-relaxed text-paper/40">
              Secure inquiry form powered by HoneyBook. Your details go straight
              to our studio inbox.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
