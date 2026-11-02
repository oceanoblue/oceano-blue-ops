import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AssignShooterControl, type Shooter } from '@/components/orders/AssignShooterControl';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const shooters: Shooter[] = [
  { key: 'contractor:unlinked', kind: 'contractor', id: 'unlinked', name: 'Unlinked Contractor', teamMemberId: null, captureSkills: [] },
  { key: 'contractor:linked', kind: 'contractor', id: 'linked', name: 'Linked Videographer', teamMemberId: 'linked-team-id', captureSkills: ['videography'] },
  { key: 'team:staff', kind: 'team', id: 'staff', name: 'Team Videographer', captureSkills: ['photography', 'videography'] },
];
const props: ComponentProps<typeof AssignShooterControl> = {
  orderId: 'order', currentContractorId: null, currentPhotographerId: 'staff', currentVideographerId: null,
  updatedAt: '2026-11-02T15:00:00Z', needsVideo: false, shooters,
  timing: { scheduled_at: '2026-11-04T15:00:00Z', duration_minutes: 60 },
  timezone: 'America/New_York', canRenew: false, assignmentRound: 1,
};
function render(overrides: Partial<typeof props> = {}) {
  const html = renderToStaticMarkup(createElement(AssignShooterControl, { ...props, ...overrides }));
  const videoRow = html.match(/<dt[^>]*>Videographer<\/dt><dd[^>]*>(.*?)<\/dd>/s)?.[1];
  expect(videoRow).toBeDefined();
  return { html, videoRow: videoRow! };
}

describe('videographer assignment display', () => {
  it.each([null, ''])('does not match an unlinked contractor when video assignment is %s', currentVideographerId => {
    const { html, videoRow } = render({ currentVideographerId });
    expect(videoRow).toBe('Unassigned');
    expect(html).not.toContain('Unlinked Contractor');
    expect(html).not.toContain('Video is booked.');
  });

  it.each([null, ''])('keeps the booked-video warning without inventing a crew member or visit when assignment is %s', currentVideographerId => {
    const { html, videoRow } = render({ currentVideographerId, needsVideo: true });
    expect(videoRow).toBe('Unassigned');
    expect(html).not.toContain('Unlinked Contractor');
    expect(html).toContain('Video is booked. Assign a videographer before the shoot.');
  });

  it.each([
    ['linked-team-id', 'Linked Videographer'],
    ['staff', 'Team Videographer'],
  ])('resolves the assigned scheduling identity %s and retains its visit', (currentVideographerId, name) => {
    const { html, videoRow } = render({ currentVideographerId, needsVideo: true });
    expect(videoRow).toContain(name);
    expect(videoRow).toContain('10:00 AM–11:00 AM');
    expect(html).not.toContain('Unlinked Contractor');
    expect(html).not.toContain('Video is booked.');
  });

  it('still shows an explicit video assignment when no booked video product is present', () => {
    const { videoRow } = render({ currentVideographerId: 'staff' });
    expect(videoRow).toContain('Team Videographer');
    expect(videoRow).not.toContain('Unassigned');
  });
});
