import { IMAGES } from './images';

/** Real project imagery pulled from the Oceano Blue Webflow CMS (public CDN). */
const WF = 'https://cdn.prod.website-files.com/69444684984a6f0201f00572';
export const WORKS = {
  stee: `${WF}/6984f42193788f5a0914211f_Stee1.jpeg`,
  mike: `${WF}/69f8c581283142b4bfa11eba_Mike.jpeg`,
  newport: `${WF}/69f4e5efebf317532f0b4b79_ab785e7b2fe94539ebf0617e53f6d575-xlarge.jpeg`,
  southernCoastal: `${WF}/69f882cd9cace6d7add7e281_OBM05574.jpeg`,
  mitchelville: `${WF}/69f4fdb51caa685cefdde890_a664b65d318c23bdd6d9ddc562d52877-xlarge.jpeg`,
  barefoot: `${WF}/69f4e552a754197b3e719db1_24bcb2c75ce6defeb8d57cce59100e63-xlarge.jpeg`,
} as const;

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
    image: WORKS.mike,
  },
  {
    no: '02',
    title: 'Photography',
    blurb:
      'Still images that speak volumes. Every shot is composed with purpose, lit with care, and crafted to represent your brand at its absolute best.',
    tags: ['Brand', 'Lifestyle', 'Corporate', 'Events', 'Editorial'],
    image: WORKS.stee,
  },
  {
    no: '03',
    title: 'Headshots & Portraits',
    blurb:
      'Confident, character-rich portraits for teams and founders — studio-lit, expertly directed, and retouched with a natural hand.',
    tags: ['Teams', 'Founders', 'Studio', 'On-location'],
    image: IMAGES.headshot,
  },
  {
    no: '04',
    title: 'Real Estate & Architecture',
    blurb:
      'Ground-level architectural photography and aerial drone imaging that showcase craftsmanship from foundation to finish.',
    tags: ['HDR', 'Twilight', 'Drone', 'Walkthroughs'],
    image: WORKS.southernCoastal,
  },
  {
    no: '05',
    title: 'Podcast Studio',
    blurb:
      'A fully treated, camera-ready podcast and content studio in Old Town Bluffton — book the room, we run the gear.',
    tags: ['Multi-cam', 'Audio', 'Live-stream', 'Editing'],
    image: IMAGES.podcast,
  },
];

export const STATS = [
  { value: '16+', label: 'Brands served' },
  { value: 'SC + GA', label: 'On location' },
  { value: 'Video + Photo', label: 'Full production' },
  { value: 'Local → National', label: 'Trusted reach' },
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
