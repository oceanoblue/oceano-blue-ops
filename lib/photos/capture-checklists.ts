/**
 * Per-profile capture checklists (Phase C).
 *
 * The production profile (`orders.project_type`) is the first decision on a
 * shoot, and it should shape HOW the set is captured — not just how it's graded.
 * A fast MLS gallery and a documentary architectural set need different shot
 * discipline at the camera. These checklists are the data-driven, on-order
 * guidance the photographer follows; the ops order page renders them for the
 * order's profile.
 *
 * Pure data + a resolver — no I/O. Unit-tested in capture-checklists.test.ts.
 */
import type { ProjectType } from './profiles';
import { profileFor } from './profiles';

export interface ChecklistItem {
  text: string;
  /** A must-do for this profile — the result is compromised without it. */
  critical?: boolean;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

const c = (text: string): ChecklistItem => ({ text, critical: true });
const o = (text: string): ChecklistItem => ({ text });

export const CAPTURE_CHECKLISTS: Record<ProjectType, ChecklistSection[]> = {
  mls_real_estate: [
    {
      title: 'Setup',
      items: [
        c('Tripod, leveled — verticals plumb'),
        o('16–24mm; one consistent eye-level height (~1.5 m) across rooms'),
        o('All lights ON, fans OFF, blinds open'),
      ],
    },
    {
      title: 'Exposure',
      items: [
        c('3-frame AEB bracket (±2 EV) per room'),
        o('Same white balance across the whole set'),
      ],
    },
    {
      title: 'Coverage',
      items: [
        c('Every room — including baths, laundry, garage'),
        o('Front + back exterior; main selling features'),
        o('Declutter surfaces before shooting'),
      ],
    },
  ],
  luxury_real_estate: [
    {
      title: 'Setup',
      items: [
        c('Tripod, leveled — verticals plumb'),
        o('Consistent eye-level height; tidy, intentional compositions'),
        o('Lights ON; stage / fluff each room first'),
      ],
    },
    {
      title: 'Exposure',
      items: [
        c('5-frame bracket where dynamic range is high (windows + interior)'),
        o('Flambient pass (ambient + flash) on hero rooms'),
      ],
    },
    {
      title: 'Coverage',
      items: [
        c('Twilight exterior of the front elevation'),
        o('Detail / vignette shots — fixtures, textures, finishes, the view'),
        o('Amenities: pool, dock, outdoor living, primary suite'),
      ],
    },
  ],
  architectural: [
    {
      title: 'Discipline',
      items: [
        c('Tripod mandatory; two-point perspective — verticals perfectly plumb (use the level/grid)'),
        c('Grey-card white balance per lighting condition'),
        o('One consistent, considered eye-level per space'),
      ],
    },
    {
      title: 'Exposure',
      items: [
        c('Bracket to HOLD window detail — never blow the exterior to white'),
        o('Expose for accuracy, not punch — no HDR look'),
      ],
    },
    {
      title: 'Document the design',
      items: [
        o('Wide + medium + detail of each space; show materials and junctions'),
        o('Capture how natural light falls through the day'),
        c('No sky replacement, no stylization — faithful only'),
      ],
    },
  ],
  interior_design: [
    {
      title: 'Colour accuracy',
      items: [
        c('Grey-card white balance per room — colour fidelity is the product'),
        c('Avoid mixed-light frames (turn off/gel competing sources)'),
      ],
    },
    {
      title: 'Texture & light',
      items: [
        o('Raking light to reveal fabric / finish texture'),
        c('Bracket for window hold so the view reads'),
      ],
    },
    {
      title: 'Coverage',
      items: [
        o("Full-room + styled vignettes per the designer's intent"),
        o('Detail shots of fabrics, hardware, and finishes at true colour'),
      ],
    },
  ],
};

/** Resolve the checklist for a raw `orders.project_type`, falling back to MLS. */
export function checklistFor(projectType: string | null | undefined): ChecklistSection[] {
  return CAPTURE_CHECKLISTS[profileFor(projectType).id];
}

/** Total item count for a checklist (used for the "0/N" progress affordance). */
export function checklistItemCount(sections: ChecklistSection[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
