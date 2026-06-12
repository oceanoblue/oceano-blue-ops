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
    <header className="glass sticky top-0 z-20 flex h-14 items-center justify-between border-b border-ink-100/80 px-6">
      <div className="text-sm text-slate-500">
        Welcome back{userEmail ? (
          <>
            , <span className="font-mono text-[12px] text-ink-700">{userEmail}</span>
          </>
        ) : ''}
      </div>
      <button onClick={signOut} className="btn-ghost text-sm">
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </header>
  );
}
