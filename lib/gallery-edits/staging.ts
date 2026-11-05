/** Public choices and illustrative references. Provider instructions stay server-only. */
export const stagingRooms = {
  living_room: 'Living room', bedroom: 'Bedroom', dining_room: 'Dining room', office: 'Home office',
  family_room: 'Family room', guest_bedroom: 'Guest bedroom', breakfast_nook: 'Breakfast nook', reading_nook: 'Reading nook',
} as const;
export const stagingStyles = {
  coastal: { label: 'Coastal', description: 'Airy linens, natural textures and relaxed seaside color.', image: '/gallery-styles/coastal.webp' },
  modern: { label: 'Modern', description: 'Clean lines, sculptural shapes and refined contrast.', image: '/gallery-styles/modern.webp' },
  transitional: { label: 'Transitional', description: 'Classic comfort with a fresh, tailored finish.', image: '/gallery-styles/transitional.webp' },
  scandinavian: { label: 'Scandinavian', description: 'Light woods, soft textures and simple, cozy pieces.', image: '/gallery-styles/scandinavian.webp' },
  modern_farmhouse: { label: 'Modern farmhouse', description: 'Warm rustic wood, soft linen and understated accents.', image: '/gallery-styles/modern_farmhouse.webp' },
  midcentury: { label: 'Mid-century modern', description: 'Warm walnut, tapered legs and vintage-inspired curves.', image: '/gallery-styles/midcentury.webp' },
} as const;
export const stagingPalettes = {
  style_default: { label: 'Let the style lead', colors: ['#e6dfd2','#b2a28b','#66796f'] },
  warm_neutral: { label: 'Warm neutrals', colors: ['#f3ece2','#d5c2aa','#9d826a'] },
  earth_tones: { label: 'Earth tones', colors: ['#b7b798','#ab7861','#705d48'] },
  soft_blue: { label: 'Soft blues', colors: ['#edf1f0','#afc6d2','#718d9e'] },
} as const;
export const stagingFurnishing = { light: 'Light & spacious', balanced: 'Comfortably furnished' } as const;
export const stagingAccents = { minimal: 'Minimal accents', welcoming: 'Soft textiles & greenery' } as const;
export type StagingChoices = {
  room: keyof typeof stagingRooms;
  style: keyof typeof stagingStyles;
  palette: keyof typeof stagingPalettes;
  furnishing: keyof typeof stagingFurnishing;
  accents: keyof typeof stagingAccents;
};
export const defaultStaging: StagingChoices = { room: 'living_room', style: 'coastal', palette: 'style_default', furnishing: 'light', accents: 'minimal' };
