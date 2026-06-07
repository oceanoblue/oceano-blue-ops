/** Real case-study data from the Oceano Blue Webflow Works CMS. */
const WF = 'https://cdn.prod.website-files.com/69444684984a6f0201f00572';

export interface Project {
  slug: string;
  name: string;
  category: string;
  color: string;
  cover: string;
  introTitle: string;
  introText: string;
  images: string[];
  midImage: string;
  finalTitle: string;
  finalText: string;
  finalImage: string;
  video?: string;
}

export const PROJECTS: Project[] = [
  {
    slug: 'stee-music-artist-photography',
    name: 'Stee',
    category: 'Music Artist · Photography',
    color: '#1F37B9',
    cover: `${WF}/6984f42193788f5a0914211f_Stee1.jpeg`,
    introTitle: 'Building a visual identity, one frame at a time',
    introText:
      'Stee is an independent music artist carving out his lane with a sound and style that are unmistakably his. We partnered on a creative photo shoot designed to give him a library of images that match the energy of his music — studio lighting setups, styled portraits, and detail work built to travel across platforms, from album art to his website.',
    images: [`${WF}/6984f28682ac7a7bace817a6_Stee2.jpeg`, `${WF}/6984f41818c54d81ea6f114a_Stee3.jpeg`],
    midImage: `${WF}/6984f40b6d13d9ae7e502cc9_Stee4.jpeg`,
    finalTitle: 'Images that work as hard as the music.',
    finalText:
      'For an independent artist, visuals are currency. The photos give Stee a cohesive look across his website, streaming profiles, social channels, and press kits — every image shot and edited to feel like a single creative vision.',
    finalImage: `${WF}/6984f2fd720e0a33656ea59d_Stee5.jpeg`,
  },
  {
    slug: 'mike-hostilo-law-firm-studio-commercial',
    name: 'Mike Hostilo Law Firm',
    category: 'Law Firm · Commercial Video',
    color: '#8B0000',
    cover: `${WF}/69f8c581283142b4bfa11eba_Mike.jpeg`,
    introTitle: 'The face of the firm, on camera and on message',
    introText:
      "Mike Hostilo Law Firm is one of the most recognized personal injury practices in the Lowcountry, with offices spanning South Carolina and Georgia. The firm shoots its commercials in our studio on a recurring basis — testimonial pieces, awareness spots, and branded content built to perform across broadcast, web, and social.",
    images: [
      `${WF}/69f4f6c231bf851acfcaa1cc_73bdb0f54eeedf41c263fa8d83dea91c-xlarge.jpeg`,
      `${WF}/69f4f6c231bf851acfcaa1dc_8d7de69759952b5b7568bbb29ffe333a-xlarge.jpeg`,
      `${WF}/69f4f6c231bf851acfcaa1d8_842488e95b46173f9dc16675f7c544a0-xlarge.jpeg`,
    ],
    midImage: `${WF}/69f4f6c231bf851acfcaa1d5_938ceaabc0a0a9ecada9a394e1f37132-xlarge.jpeg`,
    finalTitle: 'Recognizable presence. Consistent execution.',
    finalText:
      "Mike Hostilo's brand presence is built on visibility and trust, and our role is to keep both consistent. Recurring shoots throughout the year mean campaigns can be refreshed quickly without losing the look audiences across South Carolina and Georgia already recognize.",
    finalImage: `${WF}/69f4f6c231bf851acfcaa1cf_9cb1e9df003613b24866726f339a895b-xlarge.jpeg`,
    video: 'https://vimeo.com/1188480603',
  },
  {
    slug: 'newport-hospitality-group-leadership-retreat',
    name: 'Newport Hospitality Group',
    category: 'Hospitality · Event Video',
    color: '#2C5F2D',
    cover: `${WF}/69f4e5efebf317532f0b4b79_ab785e7b2fe94539ebf0617e53f6d575-xlarge.jpeg`,
    introTitle: 'Capturing the people behind a hospitality legacy',
    introText:
      'Newport Hospitality Group manages hotels and hospitality properties across the Southeast and beyond. Our partnership covers leadership retreats, conference intro videos, and multi-day event coverage — every deliverable shot and edited to live as both a marketing asset and a permanent record of the people behind the company.',
    images: [
      `${WF}/69f4e51df0dc9af6c10022a3_05688b7ef8bc23f09afc1e1ea2825a7b-xlarge.jpeg`,
      `${WF}/69f4e51df0dc9af6c10022ac_68818c3cca3c84ff325bdea56c258a15-xlarge.jpeg`,
      `${WF}/69f4e51df0dc9af6c10022a9_963595b4896e5a7a2c60c88a32e70ea2-xlarge.jpeg`,
    ],
    midImage: `${WF}/69f4e51df0dc9af6c10022b6_b33fecd821c354cd87231156ebf3c745-xlarge.jpeg`,
    finalTitle: 'Heritage work, made for the long run.',
    finalText:
      "Newport Hospitality's brand is built on a track record that spans decades. Our role is to capture that visually — leadership retreats, anniversary content, and conference work that becomes heritage assets the company keeps for future leadership, partners, and hires.",
    finalImage: `${WF}/69f4e51df0dc9af6c10022b2_026a2b46c8b6445451f11e235c0bc6c4-xlarge.jpeg`,
    video: 'https://vimeo.com/1188442417',
  },
  {
    slug: 'southern-coastal-homes-architectural-photography',
    name: 'Southern Coastal Homes',
    category: 'Custom Homes · Architectural',
    color: '#2B4C7E',
    cover: `${WF}/69f882cd9cace6d7add7e281_OBM05574.jpeg`,
    introTitle: 'Showcasing coastal craftsmanship',
    introText:
      'Southern Coastal Homes builds distinctive custom residences throughout Hilton Head Island and Bluffton. Our ongoing partnership captures each completed project through ground-level architectural photography and aerial drone imaging — a comprehensive visual portfolio that highlights the builder’s attention to detail and design excellence.',
    images: [
      `${WF}/69f4fcddf4d48923e8317496_e70bba5b5f9275c8b4ca89329e14fe29-xlarge.jpeg`,
      `${WF}/69f4fcddf4d48923e8317499_8035759ebb964209e9e7d47a739f668e-xlarge.jpeg`,
      `${WF}/69f4fcdef4d48923e83174a6_fdbf106ab87cf3661345c6b7626bf90e-xlarge.jpeg`,
    ],
    midImage: `${WF}/69f4fcdef4d48923e83174ad_9938ca783fe9b8aeed3dd94a524c38d3-xlarge.jpeg`,
    finalTitle: 'Building the Lowcountry dream',
    finalText:
      'From waterfront estates to intimate family homes, each Southern Coastal Homes project reflects the character of its surroundings. Our photography and drone coverage helps prospective homeowners envision the possibilities while giving the builder a lasting record of their finest work.',
    finalImage: `${WF}/69f4fcdef4d48923e831749c_6eda70298ed98930029a83f2329b24b3-xlarge.jpeg`,
  },
  {
    slug: 'historic-mitchelville-freedom-park-event-coverage',
    name: 'Historic Mitchelville Freedom Park',
    category: 'Historic Site · Event Coverage',
    color: '#2D5A27',
    cover: `${WF}/69f4fdb51caa685cefdde890_a664b65d318c23bdd6d9ddc562d52877-xlarge.jpeg`,
    introTitle: 'Preserving history through the lens',
    introText:
      'Historic Mitchelville Freedom Park on Hilton Head Island commemorates the first self-governed town of formerly enslaved people in the United States. Our ongoing partnership provides comprehensive event coverage for their celebrations, groundbreakings, and community gatherings — from Juneteenth festivals to the Archaeological Research Facility groundbreaking.',
    images: [
      `${WF}/69f4fdb51caa685cefdde87e_74807bfcd1237fd7c442bbd25767fcbb-xlarge.jpeg`,
      `${WF}/69f4fdb51caa685cefdde88c_ba487061404040335b46bfbf304eca70-xlarge.jpeg`,
      `${WF}/69f4fdb51caa685cefdde889_787274a9dd1baa65815cd970c26cff44-xlarge.jpeg`,
    ],
    midImage: `${WF}/69f4fdb51caa685cefdde885_88f15fbebe6b5256eb1332c8382b1889-xlarge.jpeg`,
    finalTitle: 'Where freedom began',
    finalText:
      'Each event at Historic Mitchelville Freedom Park brings the community together to honor a legacy that shaped American history. Our photography and video work helps the park share its mission with the world — documenting milestones, celebrations, and the ongoing effort to build a world-class heritage destination.',
    finalImage: `${WF}/69f4fdb51caa685cefdde881_4d6b385ae68b17e4c1d4350ad263e798-xlarge.jpeg`,
    video: 'https://vimeo.com/1188482532',
  },
  {
    slug: 'barefoot-technologies-conference-corporate-video',
    name: 'Barefoot Technologies',
    category: 'Software · Corporate Video',
    color: '#14365C',
    cover: `${WF}/69f4e552a754197b3e719db1_24bcb2c75ce6defeb8d57cce59100e63-xlarge.jpeg`,
    introTitle: 'Annual conferences, captured for the year that follows',
    introText:
      'Barefoot Technologies provides vacation rental management software to property managers across North America, with deep client roots in Hilton Head and the Lowcountry. We cover the company’s annual conferences, partner events, and corporate video needs — speaker sessions, partner panels, venue B-roll, and recap content.',
    images: [
      `${WF}/69f4deb1e08410a8d6800959_7c332968e47b395d19ae4319c0489b41-xlarge.jpeg`,
      `${WF}/69f4deb1e08410a8d6800973_5a57f1c3799fc57542bc693ccc3d867c-xlarge.jpeg`,
      `${WF}/69f4deb1e08410a8d6800952_db5aeafcf39f0100e10fdc2dd0d81168-xlarge.jpeg`,
    ],
    midImage: `${WF}/69f4deb1e08410a8d6800962_287245398498ec4e1a83d2967cbae4c5-xlarge.jpeg`,
    finalTitle: 'One event. Twelve months of content.',
    finalText:
      "Conferences happen once a year; the footage gets used for the next twelve months. Our coverage of Barefoot's events gives the team marketing content, partner highlights, and recap pieces that fuel their communications calendar long after attendees have flown home.",
    finalImage: `${WF}/69f4deb1e08410a8d6800965_af94ab19264ae78cf2296c9265e6f698-xlarge.jpeg`,
    video: 'https://vimeo.com/1188445494',
  },
];

export const getProject = (slug: string) => PROJECTS.find((p) => p.slug === slug);
