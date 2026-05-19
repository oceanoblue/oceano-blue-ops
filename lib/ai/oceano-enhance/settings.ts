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
      .select('target_long_edge, shadow_lift, highlight_recover, vibrance, jpeg_quality')
      .eq('id', true)
      .maybeSingle();
    if (!data) return {};
    return {
      targetLongEdge: data.target_long_edge ?? undefined,
      shadowLift: data.shadow_lift != null ? Number(data.shadow_lift) : undefined,
      highlightRecover:
        data.highlight_recover != null ? Number(data.highlight_recover) : undefined,
      vibrance: data.vibrance != null ? Number(data.vibrance) : undefined,
      jpegQuality: data.jpeg_quality ?? undefined,
    };
  } catch {
    return {};
  }
}
