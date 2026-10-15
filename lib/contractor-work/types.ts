export interface SignatureEvidence {
  name: string; email: string; user_id: string; at: string; consent: string; method: string; browser?: string;
}
export interface ContractorAgreement {
  id: string; contractor_id: string; company_legal_name: string; contractor_legal_name: string;
  contractor_email: string; template_version: string; body_text: string; esign_consent: string;
  document_hash: string; status: 'draft' | 'issued' | 'executed' | 'void';
  company_signature: SignatureEvidence | null; contractor_signature: SignatureEvidence | null;
  void_reason: string | null; created_at: string; updated_at: string;
}
export interface IntakeFile { name: string; size: number; content_hash?: string; }
export interface VideoIntake {
  id: string; contractor_id: string; title: string; location: string; shoot_date: string | null;
  due_at: string | null; instructions: string; status: 'assigned' | 'submitted' | 'changes_requested' | 'received' | 'cancelled';
  dropbox_path: string | null; dropbox_url: string | null; dropbox_request_id: string | null;
  reported_file_count: number | null; verified_file_count: number; verified_bytes: number;
  file_manifest: IntakeFile[]; handoff_notes: string; audio_status: string | null;
  backup_confirmed: boolean; originals_confirmed: boolean; revision_note: string | null;
  submitted_at: string | null; reviewed_at: string | null; created_at: string;
}
export interface ContractorOption { id: string; full_name: string; email: string; }
export interface AuditEvent { id: string; kind: string; details: Record<string, unknown>; created_at: string; }
export const AGREEMENT_LABELS: Record<ContractorAgreement['status'], string> = {draft:'Draft',issued:'Awaiting contractor signature',executed:'Signed by both parties',void:'Voided'};
export const VIDEO_LABELS: Record<VideoIntake['status'], string> = {assigned:'Ready for upload',submitted:'Submitted for review',changes_requested:'Changes requested',received:'Received by office',cancelled:'Cancelled'};
export function formatBytes(n: number): string { if (!n) return '0 B'; const units=['B','KB','MB','GB','TB']; const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024))); return `${(n/1024**i).toFixed(i?1:0)} ${units[i]}`; }
export function agreementSnapshot(a: Pick<ContractorAgreement,'template_version'|'company_legal_name'|'contractor_legal_name'|'contractor_email'|'esign_consent'|'body_text'>): string {
  return ['Oceano Blue contractor agreement',a.template_version,a.company_legal_name,a.contractor_legal_name,a.contractor_email,a.esign_consent,a.body_text].join('\n');
}
