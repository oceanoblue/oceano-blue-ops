import { createHash, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { crmDb, CrmError } from "@/lib/crm/server";
import { inquiryOfficeConfig } from "@/lib/crm/inquiry-server";
import { escapeEmail } from "@/lib/crm/acquisition-mail";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import {
  MAX_FILES,
  MAX_SUBMISSION_BYTES,
  SOCIAL_BUCKET,
  UPLOAD_WINDOW_HOURS,
  answerRows,
  fileKind,
  fileProblem,
  safeFileName,
  type FileKind,
  type SocialAnswers,
  type fileRequestSchema,
  type submitSchema,
} from "./schema";

/** Ceiling on upload requests across all clients in any 24 hours. */
const DAILY_FILE_CAP = 400;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

type Submit = z.infer<typeof submitSchema>;
type FileRequest = z.infer<typeof fileRequestSchema>;

export type SocialFile = {
  id: string;
  kind: FileKind;
  original_name: string;
  size_bytes: number | null;
  declared_bytes: number;
  status: "pending" | "uploaded";
};
export type SocialIntake = {
  id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  package: string;
  answers: SocialAnswers;
  expected_files: number;
  status: "new" | "reviewed";
  reviewed_at: string | null;
  created_at: string;
  files: SocialFile[];
};

// ---------------------------------------------------------------------------
// Public: a client sends the intake, then adds files to it
// ---------------------------------------------------------------------------

export async function submitIntake(body: Submit): Promise<void> {
  const db = crmDb();
  const a = body.answers;
  const requestHash = sha(JSON.stringify(a));
  const tokenHash = sha(body.upload_token);
  const { error } = await db.from("social_onboarding_submissions").insert({
    id: body.submission_id,
    request_hash: requestHash,
    upload_token_hash: tokenHash,
    business_name: a.business_name,
    contact_name: a.contact_name,
    email: a.email,
    phone: a.phone,
    package: a.package,
    answers: a,
    expected_files: body.expected_files,
  });
  if (error) {
    if (error.code !== "23505")
      throw new CrmError("We couldn't save your details. Please try again.", 503);
    // Same request sent twice (a retry after a dropped connection). Accept it
    // only when it really is the same request from the same browser.
    const existing = await db
      .from("social_onboarding_submissions")
      .select("request_hash,upload_token_hash")
      .eq("id", body.submission_id)
      .maybeSingle();
    if (
      existing.error ||
      !existing.data ||
      existing.data.request_hash !== requestHash ||
      !sameHash(existing.data.upload_token_hash, tokenHash)
    )
      throw new CrmError("Reload the page and send your details again.", 409);
    return;
  }
  await notifyOffice(body.submission_id, a, body.expected_files);
}

async function notifyOffice(id: string, a: SocialAnswers, expectedFiles: number) {
  // The recipient is server configuration, never something from the request.
  const office = inquiryOfficeConfig();
  if (!office.enabled || !office.recipient || !isEmailConfigured()) return;
  const rows = answerRows(a)
    .map(
      (r) =>
        `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#50677c">${escapeEmail(r.label)}</td><td style="padding:4px 0;white-space:pre-wrap">${escapeEmail(r.value)}</td></tr>`,
    )
    .join("");
  try {
    await sendEmail({
      to: office.recipient,
      subject: `Social media onboarding: ${a.business_name.replace(/[\r\n]/g, " ")}`,
      html: `<p>${escapeEmail(a.contact_name)} sent the social media onboarding form${expectedFiles ? ` and is uploading ${expectedFiles} file${expectedFiles === 1 ? "" : "s"}` : ""}.</p><table style="border-collapse:collapse;font-size:14px">${rows}</table><p><a href="https://app.oceanoblue.net/dashboard/crm/social-onboarding">Open social onboarding</a></p>`,
      replyTo: a.email,
      idempotencyKey: `social-onboarding/${id}`,
    });
  } catch {
    // The intake is saved and visible in the dashboard either way.
  }
}

async function authorizedSubmission(id: string, token: string) {
  const { data, error } = await crmDb()
    .from("social_onboarding_submissions")
    .select("id,upload_token_hash,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new CrmError("Uploads are temporarily unavailable.", 503);
  if (!data || !sameHash(data.upload_token_hash, sha(token)))
    throw new CrmError("Reload the page and send your details again.", 403);
  if (Date.now() - Date.parse(data.created_at) > UPLOAD_WINDOW_HOURS * 3600_000)
    throw new CrmError(
      "This upload session has expired. Email your remaining files to info@oceanoblue.net.",
      410,
    );
  return data;
}

export async function signFileUpload(req: Extract<FileRequest, { action: "sign" }>) {
  const problem = fileProblem(req.name, req.size);
  if (problem) throw new CrmError(problem);
  await authorizedSubmission(req.submission_id, req.upload_token);
  const db = crmDb();
  const path = `${req.submission_id}/${req.file_id}-${safeFileName(req.name)}`;

  const current = await db
    .from("social_onboarding_files")
    .select("id,status,declared_bytes,storage_path")
    .eq("submission_id", req.submission_id);
  if (current.error) throw new CrmError("Uploads are temporarily unavailable.", 503);
  const existing = current.data.find((f) => f.id === req.file_id);
  if (existing?.status === "uploaded") return { already_uploaded: true as const };
  if (existing && existing.storage_path !== path)
    throw new CrmError("Remove this file and add it again.", 409);
  if (!existing) {
    if (current.data.length >= MAX_FILES)
      throw new CrmError(`You can upload up to ${MAX_FILES} files here. Share a folder link for the rest.`);
    const total = current.data.reduce((n, f) => n + Number(f.declared_bytes), 0);
    if (total + req.size > MAX_SUBMISSION_BYTES)
      throw new CrmError("That's more than 10 GB in total. Share a folder link for the rest.");
    const day = new Date(Date.now() - 24 * 3600_000).toISOString();
    const recent = await db
      .from("social_onboarding_files")
      .select("id", { count: "exact", head: true })
      .gte("created_at", day);
    if (recent.error || (recent.count ?? 0) >= DAILY_FILE_CAP)
      throw new CrmError("Uploads are busy right now. Please try again later.", 503);
    const inserted = await db.from("social_onboarding_files").insert({
      id: req.file_id,
      submission_id: req.submission_id,
      kind: fileKind(req.name)!,
      original_name: req.name,
      storage_path: path,
      content_type: req.content_type,
      declared_bytes: req.size,
    });
    // A file id that already belongs to another intake is never re-signed.
    if (inserted.error) throw new CrmError("Remove this file and add it again.", 409);
  }
  // upsert lets a failed attempt be retried against the same path.
  const signed = await db.storage
    .from(SOCIAL_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (signed.error || !signed.data)
    throw new CrmError("Uploads are temporarily unavailable.", 503);
  return {
    already_uploaded: false as const,
    bucket: SOCIAL_BUCKET,
    path,
    token: signed.data.token,
    signed_url: signed.data.signedUrl,
  };
}

export async function confirmFileUpload(req: Extract<FileRequest, { action: "done" }>) {
  await authorizedSubmission(req.submission_id, req.upload_token);
  const db = crmDb();
  const { data: file, error } = await db
    .from("social_onboarding_files")
    .select("id,status,storage_path")
    .eq("id", req.file_id)
    .eq("submission_id", req.submission_id)
    .maybeSingle();
  if (error) throw new CrmError("Uploads are temporarily unavailable.", 503);
  if (!file) throw new CrmError("Remove this file and add it again.", 404);
  if (file.status === "uploaded") return;
  // Trust storage, not the browser, about whether the file arrived.
  const info = await db.storage.from(SOCIAL_BUCKET).info(file.storage_path);
  if (info.error || !info.data)
    throw new CrmError("That file didn't finish uploading. Try it again.", 409);
  const saved = await db
    .from("social_onboarding_files")
    .update({
      status: "uploaded",
      size_bytes: info.data.size ?? null,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", file.id);
  if (saved.error) throw new CrmError("Uploads are temporarily unavailable.", 503);
}

// ---------------------------------------------------------------------------
// Office
// ---------------------------------------------------------------------------

export async function listIntakes(): Promise<SocialIntake[]> {
  const db = crmDb();
  const { data, error } = await db
    .from("social_onboarding_submissions")
    .select(
      "id,business_name,contact_name,email,phone,package,answers,expected_files,status,reviewed_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new CrmError("Social onboarding is temporarily unavailable.", 503);
  if (!data.length) return [];
  const files = await db
    .from("social_onboarding_files")
    .select("id,submission_id,kind,original_name,size_bytes,declared_bytes,status")
    .in(
      "submission_id",
      data.map((d) => d.id),
    )
    .order("created_at");
  if (files.error) throw new CrmError("Social onboarding is temporarily unavailable.", 503);
  return data.map((d) => ({
    ...d,
    files: files.data.filter((f) => f.submission_id === d.id),
  })) as SocialIntake[];
}

export async function setIntakeStatus(actor: string, id: string, status: "new" | "reviewed") {
  const { data, error } = await crmDb()
    .from("social_onboarding_submissions")
    .update(
      status === "reviewed"
        ? { status, reviewed_by: actor, reviewed_at: new Date().toISOString() }
        : { status, reviewed_by: null, reviewed_at: null },
    )
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new CrmError("Unable to save. Please retry.", 503);
  if (!data) throw new CrmError("Intake not found.", 404);
}

/** Five-minute download link for one uploaded file. */
export async function fileDownloadUrl(fileId: string): Promise<string> {
  const db = crmDb();
  const { data: file, error } = await db
    .from("social_onboarding_files")
    .select("storage_path,original_name,status")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw new CrmError("Files are temporarily unavailable.", 503);
  if (!file || file.status !== "uploaded") throw new CrmError("File not found.", 404);
  const signed = await db.storage
    .from(SOCIAL_BUCKET)
    .createSignedUrl(file.storage_path, 300, { download: file.original_name });
  if (signed.error || !signed.data)
    throw new CrmError("Files are temporarily unavailable.", 503);
  return signed.data.signedUrl;
}
