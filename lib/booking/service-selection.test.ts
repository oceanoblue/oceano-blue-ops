import { describe, expect, it } from 'vitest';
import { selectionProblem, type SelectionProduct } from './service-selection';

function product(slug: string, name: string, is_addon = false): SelectionProduct {
  return { id: slug, slug, name, is_addon };
}

const photos = product('interior_exterior_photo', 'Interior/Exterior Photography');
const video = product('cinematic_video', 'Listing Walkthrough Video');
const floor = product('floor_plan', 'Floor Plan');
const aerial = product('drone_photos_video', 'Aerial Photos + Drone Video Only');
const dronePhoto = product('drone_photography', 'Drone Photography', true);
const droneVideo = product('drone_video', 'Drone Video Add-On', true);
const threeD = product('three_d_floor_plan', '3D Home + Floor Plan', true);
const sameDay = product('same_day_delivery', 'Same-Day Delivery', true);
const twilight = product('twilight', 'Twilight Shoot', true);
const archVideo = product('arch_video', 'Builder & Architectural Video');
const archDrone = product('arch_drone_video', 'Drone video', true);

describe('booking service selection', () => {
  it.each([
    ['walkthrough and floor plan', [video, floor]],
    ['walkthrough and drone video add-on', [video, droneVideo]],
    ['photography and drone video add-on', [photos, droneVideo]],
    ['photography and drone photo add-on', [photos, dronePhoto]],
    ['standalone aerial package', [aerial]],
    ['floor plan alone', [floor]],
    ['photography with 3D and same-day add-ons', [photos, threeD, sameDay]],
    ['a generic add-on with a main service', [video, twilight]],
    ['architectural base and add-on', [archVideo, archDrone]],
  ] satisfies Array<[string, SelectionProduct[]]>)('allows %s', (_name, selected) => {
    expect(selectionProblem(selected)).toBeNull();
  });

  it.each([
    ['drone video alone', [droneVideo]],
    ['drone photography alone', [dronePhoto]],
    ['drone video with only a floor plan', [floor, droneVideo]],
    ['drone photography with only a floor plan', [floor, dronePhoto]],
  ] satisfies Array<[string, SelectionProduct[]]>)('explains the required main service for %s', (_name, selected) => {
    expect(selectionProblem(selected)).toContain('Interior/Exterior Photography or Listing Walkthrough Video');
  });

  it.each([sameDay, threeD])('requires photography for $name at its add-on rate', addon => {
    expect(selectionProblem([video, addon])).toContain('needs Interior/Exterior Photography');
  });

  it('requires a main service for generic and architectural add-ons', () => {
    expect(selectionProblem([twilight])).toContain('Choose a main service first');
    expect(selectionProblem([archDrone])).toContain('Choose a main service first');
  });

  it('explains that a floor plan is already included in the 3D service', () => {
    expect(selectionProblem([photos, floor, threeD])).toContain('already includes a floor plan');
  });

  it.each([dronePhoto, droneVideo])('prevents double-booking $name with the aerial package', addon => {
    expect(selectionProblem([aerial, addon])).toContain('already includes drone photos and video');
  });

  it('retains selections so the client can choose how to resolve a problem', () => {
    const selected = [aerial, dronePhoto, droneVideo];
    const before = structuredClone(selected);
    expect(selectionProblem(selected)).not.toBeNull();
    expect(selected).toEqual(before);
  });

  it('leaves the initial empty-selection state to the caller', () => {
    expect(selectionProblem([])).toBeNull();
  });
});
