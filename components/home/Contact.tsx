'use client';

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { SITE } from '@/lib/content';

const SERVICE_OPTIONS = [
  'Video Production',
  'Brand Photography',
  'Headshots',
  'Real Estate',
  'Podcast Studio',
  'Something else',
];

export function Contact() {
  const [service, setService] = useState('Video Production');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const mailto = `${SITE.emailHref}?subject=${encodeURIComponent(
    `New project inquiry — ${service}`
  )}&body=${encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\nService: ${service}\n\n${message}`
  )}`;

  return (
    <section id="contact" className="bg-ink py-20 text-paper sm:py-28">
      <div className="container-edge">
        <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
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

          {/* Inquiry form */}
          <form
            className="flex flex-col gap-5 border-t border-paper/15 pt-10 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0"
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = mailto;
            }}
            data-reveal
            data-reveal-delay={120}
          >
            <div>
              <label className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50">
                What do you need?
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => setService(opt)}
                    className={`rounded-full border px-4 py-2 font-mono text-[0.7rem] uppercase tracking-wide transition-colors ${
                      service === opt
                        ? 'border-ocean bg-ocean text-white'
                        : 'border-paper/25 text-paper/70 hover:border-paper/60'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Your name" value={name} onChange={setName} placeholder="Jane Doe" />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="jane@brand.com"
              type="email"
            />

            <div>
              <label className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50">
                Tell us about the project
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Timeline, budget range, the vibe you're after…"
                className="mt-3 w-full resize-none border-b border-paper/25 bg-transparent py-2 font-grotesk text-base text-paper placeholder:text-paper/35 focus:border-ocean focus:outline-none"
              />
            </div>

            <button type="submit" className="btn-blue mt-2 self-start">
              Send inquiry <ArrowUpRight className="h-4 w-4" />
            </button>
            <p className="font-mono text-[0.65rem] leading-relaxed text-paper/40">
              Opens your email app, pre-filled. Prefer to call? {SITE.phone}.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="font-mono text-[0.65rem] uppercase tracking-kicker text-paper/50">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full border-b border-paper/25 bg-transparent py-2 font-grotesk text-base text-paper placeholder:text-paper/35 focus:border-ocean focus:outline-none"
      />
    </div>
  );
}
