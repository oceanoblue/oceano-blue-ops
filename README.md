# Oceano Blue Media — Website

A bold-editorial, cinematic marketing site for **Oceano Blue Media**, a video
production & photography studio in Old Town Bluffton, SC.

Built with **Next.js 14 (App Router)** + **Tailwind CSS**, deployed on **Vercel**.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Design system

- **Type** — Fraunces (display serif), Archivo (grotesk), Space Mono (labels)
- **Palette** — Ink `#0B0B0E`, Paper `#F3EFE6`, Ocean `#1452F0`, accents coral/sand
- Tokens live in `tailwind.config.ts`; component classes in `app/globals.css`.

## Structure

```
app/            layout + homepage
components/
  site/         Nav, Footer, Marquee, Reveal (scroll observer)
  home/         Hero, Services, FeaturedWork, Studio, Showreel, Stats, Process, Contact
lib/
  content.ts    all copy + nav + services/work/process data
  images.ts     image + video asset URLs
```

## Assets

The hero stills and cinematic clips are **AI-generated** placeholders for the
first design pass (referenced from a generation CDN in `lib/images.ts`). Before
launch, replace these with the studio's real photography/footage, or migrate the
generated assets to self-hosted storage (Vercel Blob / Supabase Storage) and
update `lib/images.ts`.

## TODO before launch

- [ ] Swap AI placeholders for real work
- [ ] Wire the contact form to a real handler (Resend / Formspree) instead of `mailto:`
- [ ] Build out the remaining pages (Work, Studio, Services, Blog, Contact)
- [ ] Point `oceanoblue.net` DNS to this Vercel project
- [ ] Add `favicon`, `og-image`, sitemap, analytics
