/**
 * Hand-written types matching supabase/migrations/0001_initial_schema.sql.
 *
 * After running `npx supabase gen types typescript --local`, this file can be
 * regenerated to include views, RPCs, and richer relationships. For now this
 * minimal version keeps everything strongly typed without requiring a local
 * Supabase instance.
 */

export type TeamRole = 'admin' | 'coordinator' | 'photographer' | 'editor';
export type ListingStatus =
  | 'draft' | 'active' | 'shot' | 'in_production' | 'delivered' | 'archived';
export type OrderStatus =
  | 'draft' | 'booked' | 'scheduled' | 'shooting' | 'uploaded'
  | 'processing' | 'editing' | 'ready' | 'delivered' | 'cancelled';
export type ServiceType =
  | 'photos_hdr' | 'photos_standard' | 'twilight' | 'drone_photos' | 'drone_video'
  | 'video_walkthrough' | 'virtual_tour' | 'floor_plan' | 'matterport' | 'rush_delivery' | 'other';
export type PhotoKind = 'raw' | 'bracket_member' | 'processed' | 'delivered';
export type ProcessingStatus =
  | 'pending' | 'queued' | 'running' | 'complete' | 'failed' | 'skipped';
export type AiJobType =
  | 'hdr_merge' | 'enhance_single' | 'sky_replace' | 'window_pull'
  | 'lawn_enhance' | 'declutter' | 'twilight_convert' | 'virtual_stage';

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: TeamRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  email: string;
  full_name: string;
  brokerage: string | null;
  phone: string | null;
  billing_address: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  client_id: string;
  mls_id: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  list_price: number | null;
  access_notes: string | null;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  listing_id: string;
  client_id: string;
  status: OrderStatus;
  scheduled_at: string | null;
  duration_minutes: number;
  photographer_id: string | null;
  editor_id: string | null;
  coordinator_id: string | null;
  package_name: string | null;
  subtotal_cents: number;
  total_cents: number;
  client_notes: string | null;
  internal_notes: string | null;
  rush: boolean;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderService {
  id: string;
  order_id: string;
  service_type: ServiceType;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  created_at: string;
}

export interface Photo {
  id: string;
  order_id: string;
  kind: PhotoKind;
  bracket_group_id: string | null;
  parent_photo_id: string | null;
  storage_path: string;
  bucket: string;
  filename: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  exif: Record<string, unknown> | null;
  is_hdr: boolean;
  is_selected: boolean;
  processing_status: ProcessingStatus;
  ai_provider: string | null;
  ai_prompt: string | null;
  ai_cost_cents: number;
  sort_order: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiJob {
  id: string;
  order_id: string;
  job_type: AiJobType;
  provider: string;
  model: string | null;
  input_photo_ids: string[];
  output_photo_ids: string[];
  prompt: string | null;
  params: Record<string, unknown> | null;
  status: ProcessingStatus;
  error_message: string | null;
  cost_cents: number;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DeliveryLink {
  id: string;
  order_id: string;
  token: string;
  password_hash: string | null;
  expires_at: string | null;
  download_count: number;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScheduleBlock {
  id: string;
  team_member_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  is_available: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  order_id: string | null;
  listing_id: string | null;
  actor_id: string | null;
  actor_type: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Permissive Database shape. This intentionally widens Row/Insert/Update to
 * `any` so that joined selects (e.g. `select('*, listings(*), clients(*)')`)
 * don't collapse to `never` in TypeScript inference.
 *
 * Replace this entire file with the output of
 *   `npx supabase gen types typescript --local > lib/supabase/database.types.ts`
 * once you've wired up the Supabase CLI — that gives you the canonical typed
 * surface including views, RPCs, and join shapes.
 *
 * The plain interfaces above (TeamMember, Order, Photo, ...) remain useful as
 * hand-typed shapes you can import where you want stricter typing.
 */
type AnyTable<R> = {
  Row: R & Record<string, any>;
  Insert: Partial<R> & Record<string, any>;
  Update: Partial<R> & Record<string, any>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      team_members:    AnyTable<TeamMember>;
      clients:         AnyTable<Client>;
      listings:        AnyTable<Listing>;
      orders:          AnyTable<Order>;
      order_services:  AnyTable<OrderService>;
      photos:          AnyTable<Photo>;
      ai_jobs:         AnyTable<AiJob>;
      delivery_links:  AnyTable<DeliveryLink>;
      schedule_blocks: AnyTable<ScheduleBlock>;
      activity_log:    AnyTable<ActivityLog>;
    };
    Views: Record<string, { Row: any }>;
    Functions: Record<string, { Args: any; Returns: any }>;
    Enums: {
      team_role: TeamRole;
      listing_status: ListingStatus;
      order_status: OrderStatus;
      service_type: ServiceType;
      photo_kind: PhotoKind;
      processing_status: ProcessingStatus;
      ai_job_type: AiJobType;
    };
    CompositeTypes: Record<string, never>;
  };
}
