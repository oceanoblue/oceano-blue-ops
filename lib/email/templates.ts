/**
 * Branded HTML email templates. Inline styles only (email clients strip
 * <style>/external CSS) and a table-free, single-column layout that renders
 * consistently from Gmail to Apple Mail. Brand: ink #0c1620, ocean #0c8de9.
 */

function shell(bodyHtml: string, preheader: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d2935;">
  <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0c8de9;">Oceano Blue</div>
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
