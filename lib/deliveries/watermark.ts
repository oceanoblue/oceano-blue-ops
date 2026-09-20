import type { createAdminClient } from '@/lib/supabase/server';

export async function galleryWatermarkEnabled(db: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data, error } = await db.from('business_settings')
    .select('gallery_watermark_enabled').eq('id', true).maybeSingle();
  if (error || !data) throw new Error('Gallery settings are unavailable.');
  return data.gallery_watermark_enabled;
}
