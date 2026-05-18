import { createClient } from '@/lib/supabase/server';
import { SettingsNav } from '@/components/layout/SettingsNav';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: team } = await supabase
    .from('team_members')
    .select('id, full_name, email, role, is_active')
    .order('full_name', { ascending: true });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ocean-950">Settings</h1>
        <p className="text-sm text-slate-600">Team, AI providers, and integrations.</p>
      </div>
      <SettingsNav />

      <section className="card p-6">
        <h2 className="font-semibold mb-4">Team</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="table-head px-3 py-2">Name</th>
              <th className="table-head px-3 py-2">Email</th>
              <th className="table-head px-3 py-2">Role</th>
              <th className="table-head px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(team ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2">{m.full_name}</td>
                <td className="px-3 py-2 text-slate-700">{m.email}</td>
                <td className="px-3 py-2 capitalize">{m.role}</td>
                <td className="px-3 py-2">{m.is_active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {(team ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">No team members yet. Invite users via Supabase Auth dashboard, then add a matching row in the team_members table.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold mb-2">AI providers</h2>
        <p className="text-sm text-slate-600 mb-4">
          Configure provider keys via environment variables in Vercel:
        </p>
        <ul className="text-sm space-y-1">
          <li><code className="text-xs bg-slate-100 px-1 rounded">OPENAI_API_KEY</code> — required for GPT Image</li>
          <li><code className="text-xs bg-slate-100 px-1 rounded">GEMINI_API_KEY</code> — required for Gemini / Banana Pro</li>
          <li><code className="text-xs bg-slate-100 px-1 rounded">GEMINI_IMAGE_MODEL</code> — optional, defaults to gemini-2.5-flash-image-preview</li>
        </ul>
      </section>
    </div>
  );
}
