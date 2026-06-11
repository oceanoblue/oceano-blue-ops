'use client';

import { useState } from 'react';
import { CalendarPlus, Copy, Check } from 'lucide-react';

/**
 * Dashboard entry to the public client booking flow (/book): opens the form
 * and copies the shareable link to send to a client. The booking flow collects
 * address, property size, schedule, and creates the client + listing + order.
 */
export function BookingLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const url = `${window.location.origin}/book`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the Open link still works */
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <a href="/book" target="_blank" rel="noopener noreferrer" className="btn-primary">
        <CalendarPlus className="h-4 w-4" /> Book a shoot
      </a>
      <button
        onClick={copy}
        className="btn-secondary"
        title="Copy the client booking link to share"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
