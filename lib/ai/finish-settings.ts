import { createAdminClient } from '@/lib/supabase/server';
import { DEFAULT_FINISH_DEFAULTS, FinishDefaultsSchema } from './finishing';

export async function loadFinishDefaults() {
  const { data } = await createAdminClient().from('oceano_enhance_settings')
    .select('finish_defaults').eq('id', true).maybeSingle();
  const parsed = FinishDefaultsSchema.safeParse(data?.finish_defaults);
  return parsed.success ? parsed.data : DEFAULT_FINISH_DEFAULTS;
}
