/** Shared types for the booking wizard. */

export interface AddressData {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  /** Formatted "47 Sea Pines Dr, Hilton Head, SC 29928" — for display. */
  formatted: string;
}

export interface PropertyData {
  sqft: number;
}

export interface SelectedItem {
  product_id: string;
  quantity: number;
}

export interface ScheduleData {
  scheduled_at: string | null;         // ISO
  duration_minutes: number;
  timezone: string;
  access_method: string;
  highlights: string;
}

export interface ContactData {
  email: string;
  name: string;
  phone: string;
  brokerage: string;
}

export interface BookingState {
  step: 1 | 2 | 3 | 4 | 5;
  address: AddressData | null;
  property: PropertyData;
  items: SelectedItem[];
  schedule: ScheduleData;
  contact: ContactData;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  kind: string;
  short_description: string | null;
  long_description: string | null;
  cover_image_url: string | null;
  is_addon: boolean;
  price_cents: number;
  base_price_cents: number;
  duration_minutes: number;
  sort_order: number;
  recommended_addon_ids: string[];
}
