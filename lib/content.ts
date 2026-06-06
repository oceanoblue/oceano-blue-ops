import { PHOTOS } from './images';

/** Real project imagery pulled from the Oceano Blue Webflow CMS (public CDN). */
const WF = 'https://cdn.prod.website-files.com/69444684984a6f0201f00572';
/** Extra real case photos (distinct from the homepage covers) for the bento. */
export const SHOWCASE = {
  aerial: `${WF}/69f4fcdef4d48923e83174ad_9938ca783fe9b8aeed3dd94a524c38d3-xlarge.jpeg`,
  event: `${WF}/69f4e51df0dc9af6c10022a3_05688b7ef8bc23f09afc1e1ea2825a7b-xlarge.jpeg`,
};
export const WORKS = {
  stee: `${WF}/6984f42193788f5a0914211f_Stee1.jpeg`,
  mike: `${WF}/69f8c581283142b4bfa11eba_Mike.jpeg`,
  newport: `${WF}/69f4e5efebf317532f0b4b79_ab785e7b2fe94539ebf0617e53f6d575-xlarge.jpeg`,
  southernCoastal: `${WF}/69f882cd9cace6d7add7e281_OBM05574.jpeg`,
  mitchelville: `${WF}/69f4fdb51caa685cefdde890_a664b65d318c23bdd6d9ddc562d52877-xlarge.jpeg`,
  barefoot: `${WF}/69f4e552a754197b3e719db1_24bcb2c75ce6defeb8d57cce59100e63-xlarge.jpeg`,
} as const;

/** Real portfolio photos (project case images from the Webflow CMS). */
export const GALLERY = [
  { src: `${WF}/69f4fcdef4d48923e83174ad_9938ca783fe9b8aeed3dd94a524c38d3-xlarge.jpeg`, cat: 'Architectural · Aerial' },
  { src: `${WF}/6984f28682ac7a7bace817a6_Stee2.jpeg`, cat: 'Photography · Portrait' },
  { src: `${WF}/69f4fdb51caa685cefdde87e_74807bfcd1237fd7c442bbd25767fcbb-xlarge.jpeg`, cat: 'Event Coverage' },
  { src: `${WF}/69f4e51df0dc9af6c10022a3_05688b7ef8bc23f09afc1e1ea2825a7b-xlarge.jpeg`, cat: 'Corporate · Event' },
  { src: `${WF}/69f4f6c231bf851acfcaa1cc_73bdb0f54eeedf41c263fa8d83dea91c-xlarge.jpeg`, cat: 'Commercial Video' },
  { src: `${WF}/69f4fcddf4d48923e8317496_e70bba5b5f9275c8b4ca89329e14fe29-xlarge.jpeg`, cat: 'Custom Homes' },
  { src: `${WF}/6984f41818c54d81ea6f114a_Stee3.jpeg`, cat: 'Photography · Portrait' },
  { src: `${WF}/69f4fdb51caa685cefdde88c_ba487061404040335b46bfbf304eca70-xlarge.jpeg`, cat: 'Event Coverage' },
  { src: `${WF}/69f4deb1e08410a8d6800959_7c332968e47b395d19ae4319c0489b41-xlarge.jpeg`, cat: 'Corporate' },
  { src: `${WF}/69f4e51df0dc9af6c10022ac_68818c3cca3c84ff325bdea56c258a15-xlarge.jpeg`, cat: 'Hospitality' },
  { src: `${WF}/69f4fcddf4d48923e8317499_8035759ebb964209e9e7d47a739f668e-xlarge.jpeg`, cat: 'Architecture' },
  { src: 'https://cdn.prod.website-files.com/69444682984a6f0201f004c9/69e6cde56b7b89e2267d10e4_OBM07703%23twilight.jpeg', cat: 'Real Estate · Twilight' },
];

export const SITE = {
  name: 'Oceano Blue',
  full: 'Oceano Blue Media',
  phone: '(843) 505-8586',
  phoneHref: 'tel:+18435058586',
  email: 'info@oceanoblue.net',
  emailHref: 'mailto:info@oceanoblue.net',
  contactName: 'Gustavo Rattia',
  contactRole: 'Co-owner, Oceano Blue Media',
  location: 'Old Town Bluffton, SC',
  region: 'The Lowcountry & beyond',
  instagram: 'https://instagram.com/oceanobluemedia',
  reelVimeoId: '1185993361',
};

export const NAV = [
  { label: 'Work', href: '#work' },
  { label: 'Services', href: '#services' },
  { label: 'Studio', href: '#studio' },
  { label: 'Process', href: '#process' },
  { label: 'Contact', href: '#contact' },
];

export const SERVICES = [
  {
    no: '01',
    title: 'Video Production',
    blurb:
      'From concept to final cut, we craft video content that captures the essence of your brand and commands attention.',
    tags: ['Commercial', 'Brand Film', 'Social Content', 'Advertising', 'Documentary'],
    image: PHOTOS.interview,
  },
  {
    no: '02',
    title: 'Photography',
    blurb:
      'Still images that speak volumes. Every shot is composed with purpose, lit with care, and crafted to represent your brand at its absolute best.',
    tags: ['Brand', 'Lifestyle', 'Corporate', 'Events', 'Editorial'],
    image: PHOTOS.team,
  },
  {
    no: '03',
    title: 'Headshots & Portraits',
    blurb:
      'Confident, character-rich portraits for teams and founders — studio-lit, expertly directed, and retouched with a natural hand.',
    tags: ['Corporate', 'LinkedIn', 'Executive', 'Team', 'Personal Brand'],
    image: PHOTOS.headshot,
  },
  {
    no: '04',
    title: 'Real Estate & Architecture',
    blurb:
      'Ground-level architectural photography and aerial drone imaging that showcase craftsmanship from foundation to finish.',
    tags: ['HDR', 'Twilight', 'Drone', 'Walkthroughs'],
    image: PHOTOS.twilight,
  },
  {
    no: '05',
    title: 'Podcast Studio',
    blurb:
      'A fully treated, camera-ready podcast and content studio in Old Town Bluffton — book the room, we run the gear.',
    tags: ['Recording', 'Studio Rental', 'Editing', 'Multi-Mic', 'Remote Guest'],
    image: PHOTOS.podcast,
  },
];

export const STATS = [
  { value: '143+', label: 'Projects delivered' },
  { value: '268', label: 'Clients served' },
  { value: '5.0', label: 'Google rating · 65+ reviews' },
  { value: '100%', label: 'Client satisfaction' },
];

export const WHY = [
  {
    no: '01',
    title: 'Cinematic quality in every frame',
    body: 'Cinema cameras, proper lighting, and a crew that has done this hundreds of times.',
  },
  {
    no: '02',
    title: 'Collaborative from brief to delivery',
    body: 'You stay in the loop from the first call to the final cut — no hand-offs, no surprises.',
  },
  {
    no: '03',
    title: 'Rooted locally. Trusted nationally.',
    body: 'Based in the Lowcountry, shooting for healthcare, real estate, hospitality, and beyond.',
  },
];

export const PROCESS = [
  { no: '01', title: 'Discovery', blurb: 'We learn your brand, your audience, and the one thing this project needs to accomplish.' },
  { no: '02', title: 'Pre-production', blurb: 'Treatment, shot list, locations, schedule — every detail locked before a frame is captured.' },
  { no: '03', title: 'Production', blurb: 'A calm, professional set. Cinema cameras, proper lighting, and an experienced crew.' },
  { no: '04', title: 'Post & Delivery', blurb: 'Edit, color, sound, and motion — delivered in every format you need, on time.' },
];

/** Real Selected Work, ordered for the homepage. */
export const WORK = [
  { title: 'Stee', category: 'Music Artist · Photography', image: WORKS.stee, video: '', span: 'big' },
  { title: 'Mike Hostilo Law Firm', category: 'Law Firm · Commercial Video', image: WORKS.mike, video: '', span: 'tall' },
  { title: 'Newport Hospitality', category: 'Hospitality · Event Video', image: WORKS.newport, video: '', span: 'tall' },
  { title: 'Southern Coastal Homes', category: 'Custom Homes · Architectural', image: WORKS.southernCoastal, video: '', span: 'wide' },
  { title: 'Historic Mitchelville', category: 'Historic Site · Event Coverage', image: WORKS.mitchelville, video: '', span: 'std' },
  { title: 'Barefoot Technologies', category: 'Software · Corporate Video', image: WORKS.barefoot, video: '', span: 'std' },
] as const;

/** Real clients / partners. */
export const CLIENT_TYPES = [
  'Novant Health',
  'Beaufort Memorial',
  'Tanger Outlets',
  'Berkeley Hall',
  'The Greenery',
  'Historic Mitchelville',
  'Mike Hostilo Law',
  'Newport Hospitality',
  'KW Lowcountry',
  'COAST Real Estate',
  'Town of Hilton Head',
  'Arts Center of Coastal Carolina',
  'The Richardson Group',
  'Barefoot Technologies',
];

/** Real client testimonials (from oceanoblue.net). */
export const TESTIMONIALS = [
  {
    quote:
      "Gustavo and his team captured our brand story in a way we never could have imagined. The final video became our most-shared piece of content ever.",
    name: "Liz Crumrine",
    org: "Dugas Realtors",
  },
  {
    quote:
      "Our marketing firm utilizes Oceano Blue for video and photography for small and large client projects. Outstanding video work and beautiful photography. Exceptional.",
    name: "Lisa Carroll",
    org: "Moonstar",
  },
  {
    quote:
      "Oceano Blue is a five-star team to work with for photography, and his social graces and demeanor are excellent. I have worked with him for years!",
    name: "Leslie Richardson",
    org: "Richardson Group",
  },
];

/** Real FAQs (from oceanoblue.net). */
export const FAQS = [
  {
    q: "What type of clients do you usually work with?",
    a: "We primarily work with businesses across the Lowcountry and beyond — healthcare systems, law firms, real estate developers, private clubs, restaurants, and retail brands. If you need professional video production, photography, or content that drives real results for your business, we're a great fit.",
  },
  {
    q: "How long does a typical project take?",
    a: "It depends on the scope, but most projects take 2–4 weeks from kickoff to final delivery. Larger campaigns or retainer work follow a monthly cadence. We'll give you a clear timeline during the proposal phase so there are no surprises.",
  },
  {
    q: "Do you offer ongoing support after a project ends?",
    a: "Absolutely. Many of our clients start with a single project and transition to a monthly retainer for ongoing content. We also offer follow-up edits, additional cuts for social media, and updated photography as your business evolves.",
  },
  {
    q: "How do I get started or request a proposal?",
    a: "Just reach out through our contact section or email us at info@oceanoblue.net. We'll schedule a free consultation to learn about your project, discuss your goals, and put together a custom proposal with a clear scope and timeline. No pressure, no obligation.",
  },
];

/** Real client logos (from the Oceano Blue Webflow asset library). */
const WFA = 'https://cdn.prod.website-files.com/69444682984a6f0201f004c9';
export const CLIENT_LOGOS = [
  { name: 'Novant Health', src: `${WFA}/69444bbaffbcd3523c0fe559_9bde34759b8ffd041f1e8916a1b14924_Novant-Health-logo-wordmark.png` },
  { name: 'Beaufort Memorial', src: `${WFA}/69444e7bbe1416448ef2bc2e_beaufort-logo.png` },
  { name: 'Tanger Outlets', src: `${WFA}/69445067ce615f2607e800d5_Tanger_logo.svg.png` },
  { name: 'Berkeley Hall', src: `${WFA}/69444cb61e328704a50a4023_BerkleyHalllogoHorizontal.png` },
  { name: 'The Greenery', src: `${WFA}/69444c738dcf894d784e18cf_fb9d70f249edae2614918b360c1db9a1_The%20greenery%20logo.png` },
  { name: 'Historic Mitchelville', src: `${WFA}/69444dc1f58ba9ecde0643a5_Mitchelville-Logo-2023-Full-Color-1.png` },
  { name: 'Mike Hostilo Law', src: `${WFA}/69444c2683e7827dc80eec66_47ecdf4c6a4b9b2ef1668191badc3604_MH-Logo-2021-NavyBlue.png` },
  { name: 'Keller Williams', src: `${WFA}/69445151604a7e0edf2868ab_Keller_Williams_Realty_logo.svg.png` },
  { name: 'Town of Hilton Head', src: `${WFA}/6944521adfb9a2be01355e03_HHITownLogo.png` },
  { name: 'Arts Center of Coastal Carolina', src: `${WFA}/69445017180eddd76b1138cb_Arts-Center-of-Coastal-Carolina.jpg.webp` },
  { name: 'The Richardson Group', src: `${WFA}/694451e23874955c586b4fc1_RGLogO_2024-1.png` },
  { name: 'Mirasol Health', src: `${WFA}/69444f9ca58e76f5c80604c1_Mirasol-Health-Logo-colored.svg` },
  { name: 'Moul Realtors', src: `${WFA}/69444f613b711cf245daa6c8_moul-realtors-logo-1.png` },
  { name: 'GBCC', src: `${WFA}/694451920fd6ac0cfdefda50_GBCC-Logo_Transparent.png` },
];
