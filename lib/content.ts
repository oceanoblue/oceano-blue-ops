import { IMAGES, VIDEOS } from './images';

export const SITE = {
  name: 'Oceano Blue',
  full: 'Oceano Blue Media',
  phone: '(843) 505-8586',
  phoneHref: 'tel:+18435058586',
  email: 'hello@oceanoblue.net',
  emailHref: 'mailto:hello@oceanoblue.net',
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
      'Brand films, commercials, and social content shot and cut with cinematic intent — from concept and storyboard to the final color grade.',
    tags: ['Brand films', 'Commercials', 'Social', 'Aerial'],
    image: IMAGES.hero,
  },
  {
    no: '02',
    title: 'Brand Photography',
    blurb:
      'Product, lifestyle, and editorial imagery that gives your brand a consistent, ownable visual language across every channel.',
    tags: ['Product', 'Lifestyle', 'Editorial', 'Campaign'],
    image: IMAGES.brandStill,
  },
  {
    no: '03',
    title: 'Headshots & Portraits',
    blurb:
      'Confident, character-rich portraits for teams and founders. Studio-lit, expertly directed, retouched with a natural hand.',
    tags: ['Teams', 'Founders', 'Studio', 'On-location'],
    image: IMAGES.headshot,
  },
  {
    no: '04',
    title: 'Real Estate & Architecture',
    blurb:
      'Listings that sell faster. HDR interiors, twilight exteriors, drone, and walkthroughs — delivered fast and MLS-ready.',
    tags: ['HDR', 'Twilight', 'Drone', 'Walkthroughs'],
    image: IMAGES.twilightHome,
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
  { value: '10+', label: 'Years behind the lens' },
  { value: '400+', label: 'Projects delivered' },
  { value: '48h', label: 'Typical turnaround' },
  { value: '100%', label: 'Lowcountry crewed' },
];

export const PROCESS = [
  {
    no: '01',
    title: 'Discovery',
    blurb:
      'We learn your brand, your audience, and the single thing this project needs to accomplish. Then we scope it precisely.',
  },
  {
    no: '02',
    title: 'Pre-production',
    blurb:
      'Treatment, shot list, locations, talent, schedule. Every detail is locked before a single frame is captured.',
  },
  {
    no: '03',
    title: 'Production',
    blurb:
      'A calm, professional set. Cinema cameras, proper lighting, and a crew that has done this hundreds of times.',
  },
  {
    no: '04',
    title: 'Post & Delivery',
    blurb:
      'Edit, color, sound, and motion — delivered in every format you need, on time, ready to publish everywhere.',
  },
];

export const WORK = [
  { title: 'Marsh & Tide', category: 'Brand Film', image: IMAGES.lowcountry, video: VIDEOS.marsh, span: 'big' },
  { title: 'Coastal Living', category: 'Real Estate', image: IMAGES.twilightHome, video: VIDEOS.realEstate, span: 'tall' },
  { title: 'Founder Series', category: 'Portraits', image: IMAGES.headshot, video: '', span: 'tall' },
  { title: 'In the Studio', category: 'Studio', image: IMAGES.studio, video: VIDEOS.studioRoom, span: 'wide' },
  { title: 'Still Life No. 4', category: 'Brand Photography', image: IMAGES.brandStill, video: '', span: 'std' },
  { title: 'The Room', category: 'Podcast Studio', image: IMAGES.podcast, video: '', span: 'std' },
] as const;

export const CLIENT_TYPES = [
  'Realtors',
  'Builders',
  'Architects',
  'Restaurants',
  'Hospitality',
  'Founders',
  'Nonprofits',
  'Creatives',
  'Local Brands',
];
