/**
 * Shared, client-safe types for the reel intake flow. No server imports here —
 * this file is pulled into the browser wizard.
 */

export type ReelType = 'monologue' | 'qa' | 'testimonial' | 'montage';

/** Output aspect → the stored "WIDTHxHEIGHT" string the brief carries. */
export const ASPECTS = [
  { value: '1080x1920', label: 'Vertical 9:16', hint: 'Reels / TikTok / Shorts' },
  { value: '1080x1080', label: 'Square 1:1', hint: 'Feed posts' },
  { value: '1920x1080', label: 'Landscape 16:9', hint: 'YouTube / web' },
] as const;

export const REEL_TYPES: { value: ReelType; label: string; blurb: string }[] = [
  { value: 'monologue', label: 'Monologue', blurb: 'One person talking to camera.' },
  { value: 'qa', label: 'Q&A / Interview', blurb: 'Questions with answer cards between.' },
  { value: 'testimonial', label: 'Testimonial', blurb: 'Client praise, cut clean.' },
  { value: 'montage', label: 'Montage / B-roll', blurb: 'Property or lifestyle b-roll.' },
];

export interface BrandKit {
  primary?: string;
  secondary?: string;
  accent?: string;
  fonts?: string;
  notes?: string;
}

/** The canonical brief the client fills in. Mirrors reel_briefs columns. */
export interface ReelBrief {
  reel_type: ReelType;
  aspect: string;
  length_target_s: number | '';
  captions: boolean;
  music: boolean;
  lower_third: boolean;
  subject_name: string;
  subject_title: string;
  brand_kit: BrandKit;
  must_include: string;
  must_avoid: string;
  about: string;
}

export const EMPTY_BRIEF: ReelBrief = {
  reel_type: 'monologue',
  aspect: '1080x1920',
  length_target_s: '',
  captions: true,
  music: false,
  lower_third: true,
  subject_name: '',
  subject_title: '',
  brand_kit: {},
  must_include: '',
  must_avoid: '',
  about: '',
};

/** Accepted footage MIME types — must stay in sync with the client-footage
 *  bucket's allowed_mime_types (migration 0046). */
export const ACCEPTED_FOOTAGE_MIME = [
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/hevc',
  'video/mpeg',
  'video/webm',
];

/** Per-file cap, matching the bucket file_size_limit (2 GB). */
export const MAX_FOOTAGE_BYTES = 2 * 1024 * 1024 * 1024;
