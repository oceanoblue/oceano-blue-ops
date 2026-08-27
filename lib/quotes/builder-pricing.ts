// Builder & Architectural pricing — a separate track from realtor listings.
// Clients: builders, construction companies, architects. More time on site,
// architectural detail photography, more delivered images. Packages (pick one)
// are priced per completed home by heated square footage, straight from the
// "Builder and Architectural Photo and Video" sheet (video is a flat $550, as
// shared with builders).

export type BuilderLineItem = { slug: string; name: string; price_cents: number; complimentary?: boolean };

export type BuilderPackage = 'photo' | 'video' | 'feature' | 'signature';

// Per-home price by tier. Upper bound of heated sq ft; 7,500+ is a manual quote
// and floors at the top tier here.
const TIERS: { max: number; images: string; photo: number; video: number; feature: number; signature: number }[] = [
  { max: 1500, images: '25–30', photo: 45000, video: 55000, feature: 117500, signature: 145000 },
  { max: 2500, images: '30–40', photo: 50000, video: 55000, feature: 122500, signature: 150000 },
  { max: 3500, images: '40–50', photo: 57500, video: 55000, feature: 130000, signature: 157500 },
  { max: 5000, images: '50–65', photo: 65000, video: 55000, feature: 137500, signature: 165000 },
  { max: 7500, images: '65–80', photo: 75000, video: 55000, feature: 147500, signature: 175000 },
];

export const BUILDER_PACKAGES: { slug: BuilderPackage; name: string; desc: string }[] = [
  { slug: 'photo', name: 'Photo', desc: 'Interior, exterior & architectural detail photography, plus drone stills' },
  { slug: 'video', name: 'Video', desc: '60–90 sec walkthrough film, licensed music, full color grade' },
  { slug: 'feature', name: 'Feature', desc: 'Photo + Video together, plus drone video and one vertical social cut' },
  { slug: 'signature', name: 'Signature', desc: 'Everything in Feature, plus a twilight exterior set and three social cuts' },
];

export const BUILDER_ADDONS: {
  slug: string; name: string; price_cents: number; qty?: boolean; unit?: string; videoOnly?: boolean;
}[] = [
  { slug: 'drone_video', name: 'Drone video', price_cents: 10000, videoOnly: true },
  { slug: 'social_cut', name: 'Additional vertical social cut', price_cents: 12500, qty: true, unit: 'cut' },
  { slug: 'twilight', name: 'Twilight exterior set', price_cents: 6500 },
  { slug: 'tour_360', name: '360° tour, hosted 12 months', price_cents: 15000 },
  { slug: 'floor_plan', name: 'Interactive floor plan', price_cents: 9500 },
  { slug: 'virtual_staging', name: 'Virtual staging', price_cents: 4500, qty: true, unit: 'room' },
  { slug: 'rush', name: '24-hour rush delivery', price_cents: 10000 },
  { slug: 'weekend', name: 'Weekend or holiday shoot', price_cents: 7500 },
];

// Builder program — 4+ homes in 12 months. Per-home discount by package.
export const BUILDER_PROGRAM_DISCOUNT: Record<BuilderPackage, number> = {
  photo: 7500, video: 5000, feature: 15000, signature: 17500,
};

export function builderTierFor(sqft: number | null) {
  const s = sqft ?? 0;
  return TIERS.find((t) => s <= t.max) ?? TIERS[TIERS.length - 1];
}

export function computeBuilderQuote(opts: {
  sqft: number | null;
  pkg: BuilderPackage;
  addons?: { slug: string; qty?: number }[];
  program?: boolean;
}): { items: BuilderLineItem[]; subtotal_cents: number } {
  const tier = builderTierFor(opts.sqft);
  const pkgMeta = BUILDER_PACKAGES.find((p) => p.slug === opts.pkg) ?? BUILDER_PACKAGES[0];
  const items: BuilderLineItem[] = [];

  const basePkg = tier[opts.pkg];
  const discount = opts.program ? BUILDER_PROGRAM_DISCOUNT[opts.pkg] ?? 0 : 0;
  items.push({ slug: `pkg_${opts.pkg}`, name: `${pkgMeta.name} package`, price_cents: Math.max(0, basePkg - discount) });

  // Drone video ships inside Feature and Signature.
  const droneIncluded = opts.pkg === 'feature' || opts.pkg === 'signature';

  for (const a of opts.addons ?? []) {
    const meta = BUILDER_ADDONS.find((x) => x.slug === a.slug);
    if (!meta) continue;
    if (a.slug === 'drone_video') {
      if (droneIncluded) { items.push({ slug: 'drone_video', name: 'Drone video', price_cents: 0, complimentary: true }); continue; }
      if (opts.pkg !== 'video') continue; // no film to add motion to
    }
    const qty = meta.qty ? Math.max(1, Math.floor(a.qty ?? 1)) : 1;
    const name = meta.qty && qty > 1 ? `${meta.name} × ${qty}` : meta.name;
    items.push({ slug: a.slug, name, price_cents: meta.price_cents * qty });
  }

  const subtotal_cents = items.reduce((s, i) => s + (i.complimentary ? 0 : i.price_cents), 0);
  return { items, subtotal_cents };
}
