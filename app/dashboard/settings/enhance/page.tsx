import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { EnhanceSettingsForm } from '@/components/settings/EnhanceSettingsForm';
import { AutoEnhanceToggle } from '@/components/settings/AutoEnhanceToggle';
import { LUXURY_BASELINE } from '@/lib/ai/oceano-enhance/pipeline';

export const dynamic = 'force-dynamic';

export default async function EnhanceSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/enhance');

  const { data: settings } = await supabase
    .from('oceano_enhance_settings')
    .select(
      'target_long_edge, jpeg_quality, exposure, contrast, temp, tint, saturation, highlights, shadows, whites, blacks, sharpening'
    )
    .eq('id', true)
    .maybeSingle();

  const { data: bizSettings } = await supabase
    .from('business_settings')
    .select('auto_enhance_on_upload')
    .eq('id', true)
    .maybeSingle();
  const autoEnhanceOnUpload = (bizSettings as any)?.auto_enhance_on_upload !== false;

  // Pull a handful of recent raw photos to use as preview samples.
  const { data: recentRaw } = await supabase
    .from('photos')
    .select('id, filename, bucket, storage_path, order_id, orders!inner(order_number)')
    .eq('kind', 'raw')
    .order('created_at', { ascending: false })
    .limit(20);

  const recent = (recentRaw ?? []).map((p: any) => ({
    id: p.id,
    filename: p.filename,
    bucket: p.bucket,
    storage_path: p.storage_path,
    order_number: p.orders?.order_number ?? 0,
  }));

  const d = (settings as any) ?? {};
  const num = (v: any, fallback: number) => (v != null ? Number(v) : fallback);
  const b = LUXURY_BASELINE;
  const initial = {
    target_long_edge: num(d.target_long_edge, 3000),
    jpeg_quality: num(d.jpeg_quality, 92),
    exposure: num(d.exposure, b.exposure ?? 0.25),
    contrast: num(d.contrast, b.contrast ?? 0.08),
    temp: num(d.temp, b.temp ?? 0),
    tint: num(d.tint, b.tint ?? 0),
    saturation: num(d.saturation, b.saturation ?? 0.1),
    highlights: num(d.highlights, b.highlights ?? 0.35),
    shadows: num(d.shadows, b.shadows ?? 0.3),
    whites: num(d.whites, b.whites ?? 0),
    blacks: num(d.blacks, b.blacks ?? -0.03),
    sharpening: num(d.sharpening, b.sharpening ?? 0.3),
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">
          Tune the Oceano Enhance luxury grade and preview it against a real upload. Saved
          values drive every enhance.
        </p>
      </div>
      <SettingsNav />
      <AutoEnhanceToggle initial={autoEnhanceOnUpload} />
      <EnhanceSettingsForm initial={initial} recent={recent} />
    </div>
  );
}
