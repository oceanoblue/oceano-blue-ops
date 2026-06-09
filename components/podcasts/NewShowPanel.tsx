'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ShowForm, type ClientOption } from './ShowForm';

export function NewShowPanel({ clients }: { clients: ClientOption[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New show
      </button>
    );
  }
  return (
    <div className="card w-full p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">New show</h2>
        <button className="text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ShowForm clients={clients} onDone={() => setOpen(false)} />
    </div>
  );
}
