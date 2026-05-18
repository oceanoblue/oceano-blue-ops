'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function Topbar({ userEmail }: { userEmail?: string | null }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-500">Welcome back{userEmail ? `, ${userEmail}` : ''}</div>
      <button onClick={signOut} className="btn-ghost text-sm">
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </header>
  );
}
