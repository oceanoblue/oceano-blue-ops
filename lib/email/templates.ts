/**
 * Branded HTML email templates. Inline styles only (email clients strip
 * <style>/external CSS) and a table-free, single-column layout that renders
 * consistently from Gmail to Apple Mail. Brand: ink #0c1620, ocean #0c8de9.
 */

function shell(bodyHtml: string, preheader: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d2935;">
  <img src="https://app.oceanoblue.net/brand/lockup-dark.png" alt="Oceano Blue Media" width="170" style="display:block;height:auto;border:0;" />
  <div style="background:#ffffff;border-radius:16px;padding:28px 24px;margin-top:14px;box-shadow:0 1px 3px rgba(12,22,32,0.08);">
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:#708698;margin:18px 4px 0;">
    Oceano Blue Media · Lowcountry real estate & commercial media
  </p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeAttr(href)}" style="display:inline-block;background:#0c8de9;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:10px;">${escapeHtml(label)}</a>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '%22');
}

export function contractorAssignmentEmail(p: {
  contractorName: string;
  address: string;
  cityStateZip?: string;
  sqft?: number | null;
  services?: string | null;
  uploadUrl: string;
  portalUrl: string;
}): { subject: string; html: string } {
  const first = (p.contractorName || '').split(' ')[0] || 'there';
  const meta = [
    p.cityStateZip,
    p.sqft ? `${p.sqft.toLocaleString()} sqft` : null,
    p.services ? p.services.replace(/^Field services:\s*/, '') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = `
    <p style="font-size:16px;margin:0 0 4px;">Hi ${escapeHtml(first)},</p>
    <p style="font-size:15px;line-height:1.5;color:#324354;margin:0 0 18px;">
      You&rsquo;ve been assigned a shoot. When you&rsquo;re done, upload the RAW files straight to its folder — one tap, no account needed.
    </p>
    <div style="border:1px solid #e6eaee;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:17px;font-weight:600;color:#0c1620;">${escapeHtml(p.address)}</div>
      ${meta ? `<div style="font-size:13px;color:#708698;margin-top:3px;">${escapeHtml(meta)}</div>` : ''}
    </div>
    <div style="margin-bottom:16px;">${button(p.uploadUrl, 'Open upload folder')}</div>
    <p style="font-size:13px;color:#708698;margin:0;">
      Prefer to track all your shoots? <a href="${escapeAttr(p.portalUrl)}" style="color:#0c8de9;">Open your photographer portal</a>.
    </p>`;

  return {
    subject: `New shoot assigned — ${p.address}`,
    html: shell(body, `Upload the RAWs for ${p.address}`),
  };
}

export function contractorResponseEmail(p: {
  contractorName: string;
  response: 'accepted' | 'declined';
  address: string;
  cityStateZip?: string | null;
  whenText?: string | null;
  note?: string | null;
  orderUrl: string;
}): { subject: string; html: string } {
  const accepted = p.response === 'accepted';
  const verb = accepted ? 'accepted' : 'declined';
  const accent = accepted ? '#059669' : '#e11d48'; // emerald / rose
  const pill = accepted
    ? 'background:#ecfdf5;color:#047857;'
    : 'background:#fff1f2;color:#be123c;';
  const meta = [p.cityStateZip, p.whenText].filter(Boolean).join(' · ');

  const body = `
    <p style="font-size:15px;line-height:1.5;color:#324354;margin:0 0 14px;">
      <strong style="color:#0c1620;">${escapeHtml(p.contractorName || 'A photographer')}</strong>
      has <span style="display:inline-block;font-weight:700;padding:1px 8px;border-radius:999px;${pill}">${escapeHtml(verb)}</span>
      a shoot assignment.
    </p>
    <div style="border:1px solid #e6eaee;border-left:4px solid ${accent};border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <div style="font-size:17px;font-weight:600;color:#0c1620;">${escapeHtml(p.address)}</div>
      ${meta ? `<div style="font-size:13px;color:#708698;margin-top:3px;">${escapeHtml(meta)}</div>` : ''}
      ${p.note ? `<div style="font-size:13px;color:#324354;margin-top:10px;padding-top:10px;border-top:1px solid #eef1f4;"><span style="color:#708698;">Note:</span> ${escapeHtml(p.note)}</div>` : ''}
    </div>
    ${!accepted ? `<p style="font-size:14px;color:#324354;margin:0 0 16px;">You'll want to reassign this shoot to another photographer.</p>` : ''}
    <div style="margin-bottom:4px;">${button(p.orderUrl, 'Open the order')}</div>`;

  return {
    subject: `Shoot ${verb} — ${p.address}`,
    html: shell(body, `${p.contractorName} ${verb} the shoot at ${p.address}`),
  };
}

export function fieldShootLoggedEmail(p: {
  contractorName: string;
  address: string;
  cityStateZip?: string | null;
  sqft?: number | null;
  services?: string | null;
  orderUrl: string;
}): { subject: string; html: string } {
  const meta = [
    p.cityStateZip,
    p.sqft ? `${p.sqft.toLocaleString()} sqft` : null,
    p.services ? p.services.replace(/^Field services:\s*/, '') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = `
    <p style="font-size:15px;line-height:1.5;color:#324354;margin:0 0 14px;">
      <strong style="color:#0c1620;">${escapeHtml(p.contractorName || 'A photographer')}</strong>
      just logged a new field shoot.
    </p>
    <div style="border:1px solid #e6eaee;border-left:4px solid #0c8de9;border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <div style="font-size:17px;font-weight:600;color:#0c1620;">${escapeHtml(p.address)}</div>
      ${meta ? `<div style="font-size:13px;color:#708698;margin-top:3px;">${escapeHtml(meta)}</div>` : ''}
    </div>
    <div style="margin-bottom:4px;">${button(p.orderUrl, 'Open the order')}</div>`;

  return {
    subject: `New field shoot logged — ${p.address}`,
    html: shell(body, `${p.contractorName} logged a new shoot at ${p.address}`),
  };
}

export function bookingConfirmationEmail(p: {
  clientName: string;
  address: string;
  cityStateZip?: string | null;
  whenText: string;
}): { subject: string; html: string } {
  const first = (p.clientName || '').split(' ')[0] || 'there';
  const body = `
    <p style="font-size:16px;margin:0 0 4px;">Hi ${escapeHtml(first)},</p>
    <p style="font-size:15px;line-height:1.5;color:#324354;margin:0 0 18px;">
      Your shoot is booked — we've got you on the schedule. Here are the details:
    </p>
    <div style="border:1px solid #e6eaee;border-left:4px solid #0c8de9;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:17px;font-weight:600;color:#0c1620;">${escapeHtml(p.address)}</div>
      ${p.cityStateZip ? `<div style="font-size:13px;color:#708698;margin-top:3px;">${escapeHtml(p.cityStateZip)}</div>` : ''}
      <div style="font-size:14px;color:#324354;margin-top:10px;padding-top:10px;border-top:1px solid #eef1f4;">
        📅 ${escapeHtml(p.whenText)}
      </div>
    </div>
    <p style="font-size:13px;color:#708698;margin:0;">
      We'll be in touch if anything changes. Questions? Just reply to this email.
    </p>`;
  return {
    subject: `Shoot booked — ${p.address}`,
    html: shell(body, `Your shoot at ${p.address} is booked for ${p.whenText}`),
  };
}

export function bookingReceivedEmail(p: {
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  address: string;
  cityStateZip?: string | null;
  whenText: string;
  orderUrl: string;
  kindLabel?: string; // e.g. "Architectural" — distinguishes the shoot type
}): { subject: string; html: string } {
  const contact = [p.clientEmail, p.clientPhone].filter(Boolean).join(' · ');
  const isArch = /architect/i.test(p.kindLabel ?? '');
  const badge = p.kindLabel
    ? `<span style="display:inline-block;font-weight:700;font-size:12px;padding:2px 9px;border-radius:999px;${
        isArch ? 'background:#f3e8ff;color:#7e22ce;' : 'background:#e0f2fe;color:#0369a1;'
      }">${escapeHtml(p.kindLabel)}</span> `
    : '';
  const body = `
    <p style="font-size:15px;line-height:1.5;color:#324354;margin:0 0 14px;">
      ${badge}New booking came in via the site.
    </p>
    <div style="border:1px solid #e6eaee;border-left:4px solid #059669;border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <div style="font-size:17px;font-weight:600;color:#0c1620;">${escapeHtml(p.address)}</div>
      ${p.cityStateZip ? `<div style="font-size:13px;color:#708698;margin-top:3px;">${escapeHtml(p.cityStateZip)}</div>` : ''}
      <div style="font-size:14px;color:#324354;margin-top:10px;padding-top:10px;border-top:1px solid #eef1f4;">
        📅 ${escapeHtml(p.whenText)}<br/>
        👤 ${escapeHtml(p.clientName)}${contact ? ` — <span style="color:#708698;">${escapeHtml(contact)}</span>` : ''}
      </div>
    </div>
    <div style="margin-bottom:4px;">${button(p.orderUrl, 'Open the order')}</div>`;
  return {
    subject: `New ${p.kindLabel ? p.kindLabel + ' ' : ''}booking — ${p.address} (${p.whenText})`,
    html: shell(body, `${p.clientName} booked ${p.address} for ${p.whenText}`),
  };
}

export function galleryReadyEmail(p: {
  recipientName?: string | null;
  address: string;
  cityStateZip?: string | null;
  galleryUrl: string;
}): { subject: string; html: string } {
  const first = (p.recipientName || '').split(' ')[0] || 'there';
  const body = `
    <p style="font-size:16px;margin:0 0 4px;">Hi ${escapeHtml(first)},</p>
    <p style="font-size:15px;line-height:1.5;color:#324354;margin:0 0 18px;">
      Your gallery is ready. View, share, and download the final photos and video below.
    </p>
    <div style="border:1px solid #e6eaee;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:17px;font-weight:600;color:#0c1620;">${escapeHtml(p.address)}</div>
      ${p.cityStateZip ? `<div style="font-size:13px;color:#708698;margin-top:3px;">${escapeHtml(p.cityStateZip)}</div>` : ''}
    </div>
    <div style="margin-bottom:16px;">${button(p.galleryUrl, 'View your gallery')}</div>
    <p style="font-size:13px;color:#708698;margin:0;">
      Or open it here: <a href="${escapeAttr(p.galleryUrl)}" style="color:#0c8de9;">${escapeHtml(p.galleryUrl)}</a>
    </p>`;
  return {
    subject: `Your gallery is ready — ${p.address}`,
    html: shell(body, `Gallery ready for ${p.address}`),
  };
}
