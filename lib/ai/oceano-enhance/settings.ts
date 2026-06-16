import { createAdminClient } from '@/lib/supabase/server';
import type { EnhanceOptions } from './pipeline';

/**
 * Fetch the current Oceano Enhance knobs from the DB. Returns the package
 * defaults if the row is missing or unreadable, so the pipeline never blocks
 * on a settings outage.
 */
export async function loadEnhanceSettings(): Promise<EnhanceOptions> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('oceano_enhance_settings')
      .select(
        'target_long_edge, jpeg_quality, exposure, contrast, temp, tint, saturation, highlights, shadows, whites, blacks, sharpening'
      )
      .eq('id', true)
      .maybeSingle();
    if (!data) return {};
    const num = (v: any) => (v != null ? Number(v) : undefined);
    return {
      targetLongEdge: (data as any).target_long_edge ?? undefined,
      jpegQuality: (data as any).jpeg_quality ?? undefined,
      exposure: num((data as any).exposure),
      contrast: num((data as any).contrast),
      temp: num((data as any).temp),
      tint: num((data as any).tint),
      saturation: num((data as any).saturation),
      highlights: num((data as any).highlights),
      shadows: num((data as any).shadows),
      whites: num((data as any).whites),
      blacks: num((data as any).blacks),
      sharpening: num((data as any).sharpening),
    };
  } catch {
    return {};
  }
}
