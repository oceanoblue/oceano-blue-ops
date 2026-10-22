import { describe, expect, it } from 'vitest';
import { serviceScope, scopeText } from './service-scope';

const photo = { description: 'Interior/Exterior Photography', quantity: 1, products: { name: 'Interior/Exterior Photography', kind: 'photo', slug: 'interior_exterior_photo' } };
const bundle = { description: '3D Home + Floor Plan', quantity: 1, products: { name: '3D Home + Floor Plan', kind: 'addon', slug: 'three_d_floor_plan' } };

describe('contractor shoot services', () => {
  it('shows both required captures for the real affected order shape with empty notes', () => {
    const scope = serviceScope({ internal_notes: null, order_services: null, order_items: [photo, bundle] });
    expect(scope).toEqual({ labels: ['Interior/Exterior Photography', '3D Home + Floor Plan (360 tour)'], has360: true, hasFloorPlan: true, splitCrew: false });
    expect(scopeText(scope)).toContain('360 tour');
  });
  it('does not invent add-ons for photo-only work', () => {
    expect(serviceScope({ order_items: [photo] })).toEqual({ labels: [photo.description], has360: false, hasFloorPlan: false, splitCrew: false });
  });
  it('keeps 360 and floor plan distinct and supports renamed catalog products', () => {
    expect(serviceScope({ order_items: [{ description: 'Interactive floor plan', products: { name: 'Interactive floor plan', kind: 'floor_plan' } }] })).toMatchObject({ has360: false, hasFloorPlan: true });
    expect(serviceScope({ order_items: [{ description: 'Tour', products: { name: 'Tour', kind: 'tour' } }] })).toMatchObject({ has360: true, hasFloorPlan: false });
    expect(serviceScope({ order_items: [{ ...bundle, description: 'Custom package', products: { ...bundle.products, name: 'Custom package' } }] })).toMatchObject({ has360: true, hasFloorPlan: true });
  });
  it('handles legacy services and field-created service tokens', () => {
    expect(serviceScope({ order_services: [{ service_type: 'virtual_tour', description: 'Full home' }, { service_type: 'floor_plan' }] })).toMatchObject({ has360: true, hasFloorPlan: true });
    expect(serviceScope({ internal_notes: 'Field services: photos, 360, floor_plan, matterport' })).toMatchObject({ has360: true, hasFloorPlan: true });
  });
  it('never revives removed services from stale legacy rows or notes', () => {
    expect(serviceScope({ order_items: [photo], order_services: [{ service_type: 'floor_plan' }], internal_notes: 'Field services: 360' })).toMatchObject({ has360: false, hasFloorPlan: false });
    expect(serviceScope({ services_revision: 1, order_items: [], order_services: [{ service_type: 'floor_plan' }], internal_notes: 'Field services: 360' }).labels).toEqual([]);
    expect(scopeText(serviceScope({ internal_notes: 'Call the office about billing' }))).toContain('Confirm with the office');
  });
  it('preserves quantities, excludes postproduction, and respects separate video crew', () => {
    const order = { photographer_id: 'photo', videographer_id: 'video', order_items: [photo, { ...bundle, quantity: 2 }, { description: 'Cinematic Video', products: { name: 'Cinematic Video', kind: 'video' } }, { description: 'Virtual Staging' }, { description: 'Rush Delivery' }] };
    const scope = serviceScope(order);
    expect(scope.labels).toEqual([photo.description, '2 × 3D Home + Floor Plan (360 tour)']);
    expect(scope.splitCrew).toBe(true);
    expect(serviceScope(order, true).labels).toContain('Cinematic Video');
  });
  it('does not count removed zero-quantity items', () => {
    expect(serviceScope({ order_items: [{ ...bundle, quantity: 0 }] })).toMatchObject({ labels: [], has360: false, hasFloorPlan: false });
  });
});
