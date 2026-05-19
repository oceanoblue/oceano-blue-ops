import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';
import { EnhanceSettingsForm } from '@/components/settings/EnhanceSettingsForm';

export const dynamic = 'force-dynamic';

export default async function EnhanceSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/settings/enhance');

  const { data: settings } = await supabase
    .from('oceano_enhance_settings')
    .select('target_long_edge, shadow_lift, highlight_recover, vibrance, jpeg_quality')
    .eq('id', true)
    .maybeSingle();

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

  const initial = (settings as any) ?? {
    target_long_edge: 3000,
    shadow_lift: 0.35,
    highlight_recover: 0.4,
    vibrance: 0.15,
    jpeg_quality: 92,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">
          Tune the Oceano Enhance pipeline and preview it against a real upload before
          saving.
        </p>
      </div>
      <SettingsNav />
      <EnhanceSettingsForm
        initial={{
          target_long_edge: Number(initial.target_long_edge),
          shadow_lift: Number(initial.shadow_lift),
          highlight_recover: Number(initial.highlight_recover),
          vibrance: Number(initial.vibrance),
          jpeg_quality: Number(initial.jpeg_quality),
        }}
        recent={recent}
      />
    </div>
  );
}
