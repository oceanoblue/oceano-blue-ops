import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { crmDb, CrmError } from "@/lib/crm/server";
import { inquiryOfficeConfig } from "@/lib/crm/inquiry-server";
import { escapeEmail } from "@/lib/crm/acquisition-mail";
import { captureError } from "@/lib/observability/report";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import {
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
  program_id: string | null;
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
    const sent = await sendEmail({
      to: office.recipient,
      subject: `Social media onboarding: ${a.business_name.replace(/[\r\n]/g, " ")}`,
      html: `<p>${escapeEmail(a.contact_name)} sent the social media onboarding form${expectedFiles ? ` and is uploading ${expectedFiles} file${expectedFiles === 1 ? "" : "s"}` : ""}.</p><table style="border-collapse:collapse;font-size:14px">${rows}</table><p><a href="https://app.oceanoblue.net/dashboard/crm/social-onboarding">Open social onboarding</a></p>`,
      replyTo: a.email,
      idempotencyKey: `social-onboarding/${id}`,
    });
    if (sent.status !== "sent") captureError("social.intake_notification", new Error(sent.status), { intake_id: id });
  } catch {
    captureError("social.intake_notification", new Error("Delivery unavailable"), { intake_id: id });
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

  const reservation = await db.rpc("social_reserve_intake_file", {
    p_intake: req.submission_id, p_file: req.file_id, p_path: path, p_name: req.name,
    p_kind: fileKind(req.name)!, p_mime: req.content_type, p_bytes: req.size,
  });
  if (reservation.error) {
    switch (reservation.error.message) {
      case "file_changed": throw new CrmError("Remove this file and add it again.", 409);
      case "file_count": throw new CrmError("You can upload up to 40 files. Share a folder link for the rest.");
      case "intake_bytes": throw new CrmError("That's more than 10 GB in total. Share a folder link for the rest.");
      case "daily_capacity": throw new CrmError("Uploads are busy right now. Please try again later.", 503);
      default: throw new CrmError("Uploads are temporarily unavailable.", 503);
    }
  }
  if (reservation.data === "uploaded") return { already_uploaded: true as const };
  const bucket = db.storage.from(SOCIAL_BUCKET);
  if (reservation.data === "pending") {
    // The browser can lose a response after Storage accepted the bytes. Finish that attempt first.
    const previous = await bucket.info(path);
    if (previous.data) {
      await confirmFileUpload({ action: "done", submission_id: req.submission_id, upload_token: req.upload_token, file_id: req.file_id });
      return { already_uploaded: true as const };
    }
  }
  const signed = await bucket.createSignedUploadUrl(path, { upsert: false });
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
    .select("id,status,storage_path,declared_bytes")
    .eq("id", req.file_id)
    .eq("submission_id", req.submission_id)
    .maybeSingle();
  if (error) throw new CrmError("Uploads are temporarily unavailable.", 503);
  if (!file) throw new CrmError("Remove this file and add it again.", 404);
  if (file.status === "uploaded") return;
  const bucket = db.storage.from(SOCIAL_BUCKET);
  const remove = async (path: string) => {
    const result = await bucket.remove([path]);
    if (result.error) throw new CrmError("Uploads are temporarily unavailable.", 503);
  };
  const staged = await bucket.info(file.storage_path);
  if (staged.error || !staged.data) {
    // Another confirmation may have committed and removed staging while this request was checking.
    const current = await db.from("social_onboarding_files").select("status").eq("id", file.id).maybeSingle();
    if (current.data?.status === "uploaded") return;
    throw new CrmError("That file didn't finish uploading. Try it again.", 409);
  }
  if (staged.data.size !== Number(file.declared_bytes)) {
    if (staged.data.size == null) throw new CrmError("We couldn't verify the file size. Please retry.", 503);
    await remove(file.storage_path);
    throw new CrmError("The received file size differs from the selected file. Please retry the upload.", 409);
  }
  // Existing upload tickets may allow replacement. The verified copy has no upload ticket.
  const finalPath = `verified/${req.submission_id}/${file.id}/${randomUUID()}`;
  const copied = await bucket.copy(file.storage_path, finalPath);
  if (copied.error) {
    const current = await db.from("social_onboarding_files").select("status").eq("id", file.id).maybeSingle();
    if (current.data?.status === "uploaded") return;
    throw new CrmError("We couldn't finish saving this file. Please retry.", 503);
  }
  const verified = await bucket.info(finalPath);
  if (verified.error || verified.data?.size !== Number(file.declared_bytes)) {
    await remove(finalPath);
    throw new CrmError("We couldn't verify the saved file. Please retry.", 503);
  }
  const saved = await db.from("social_onboarding_files")
    .update({ status: "uploaded", storage_path: finalPath, size_bytes: verified.data.size, uploaded_at: new Date().toISOString() })
    .eq("id", file.id).eq("status", "pending").select("id");
  if (saved.error) {
    // A connection can fail after the update commits. Check which copy won before cleanup.
    const current = await db.from("social_onboarding_files").select("status,storage_path").eq("id", file.id).maybeSingle();
    if (current.error) throw new CrmError("Uploads are temporarily unavailable.", 503);
    if (current.data?.storage_path !== finalPath) await remove(finalPath);
    if (current.data?.status !== "uploaded") throw new CrmError("Uploads are temporarily unavailable.", 503);
  } else if (!saved.data?.length) {
    await remove(finalPath);
    return;
  }
  // The verified copy is committed; staging cleanup can be retried by the daily maintenance task.
  const cleanup = await bucket.remove([file.storage_path]);
  if (cleanup.error) captureError("social.intake_staging_cleanup", new Error("Storage removal failed"), { file_id: file.id });
}

export async function cleanExpiredIntakeObjects(): Promise<number> {
  if (process.env.VERCEL_ENV !== "production") return 0;
  const db = crmDb();
  const { data, error } = await db.rpc("social_expired_intake_objects");
  if (error) throw new Error("Expired social uploads could not be listed.");
  const paths = (data as {object_path: string}[]).map(row => row.object_path);
  if (!paths.length) return 0;
  const removed = await db.storage.from(SOCIAL_BUCKET).remove(paths);
  if (removed.error) throw new Error("Expired social uploads could not be removed.");
  return paths.length;
}

// ---------------------------------------------------------------------------
// Office
// ---------------------------------------------------------------------------

export const INTAKE_PAGE_SIZE = 20;
export async function listIntakes(options: { id?: string; before?: { date: string; id: string } } = {}): Promise<SocialIntake[]> {
  const db = crmDb();
  let query = db.from("social_onboarding_submissions")
    .select("id,program_id,business_name,contact_name,email,phone,package,answers,expected_files,status,reviewed_at,created_at");
  if (options.id) query = query.eq("id", options.id);
  if (options.before) {
    const { date, id } = options.before;
    query = query.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(INTAKE_PAGE_SIZE);
  if (error) throw new CrmError("Social onboarding is temporarily unavailable.", 503);
  if (!data.length) return [];
  // 20 intakes of up to 40 files stay below the Storage API's row limit.
  const files = await db.from("social_onboarding_files")
    .select("id,submission_id,kind,original_name,size_bytes,declared_bytes,status")
    .in("submission_id", data.map(d => d.id)).order("created_at");
  if (files.error) throw new CrmError("Social onboarding is temporarily unavailable.", 503);
  return data.map(d => ({ ...d, files: files.data.filter(f => f.submission_id === d.id) })) as SocialIntake[];
}

export async function listIntakeProgramChoices(): Promise<{ id: string; name: string }[]> {
  const rows: { id: string; name: string }[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await crmDb().from("social_programs").select("id,name").order("name").order("id").range(start, start + 499);
    if (error) throw new CrmError("Social clients could not be loaded.", 503);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function linkedIntakes(programId: string): Promise<{ id: string; business_name: string; created_at: string }[]> {
  const { data, error } = await crmDb().from("social_onboarding_submissions").select("id,business_name,created_at")
    .eq("program_id", programId).order("created_at", {ascending: false});
  if (error) throw new CrmError("Linked intakes could not be loaded.", 503);
  return data;
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

/** Convert a submitted form only after the office selects its client. Safe to retry. */
export async function linkIntake(actor: string, id: string, programId: string | null): Promise<string> {
  const { data, error } = await crmDb().rpc("social_link_intake", { p_intake: id, p_program: programId, p_actor: actor });
  if (!error && typeof data === "string") return data;
  if (error?.code === "P0002") throw new CrmError("The intake or client could not be found.", 404);
  if (error?.message === "already_linked") throw new CrmError("This intake is already linked to a different client.", 409);
  if (error?.message === "unknown_approval_preference") throw new CrmError("The intake has an unrecognized approval preference.", 409);
  throw new CrmError("The intake could not be linked. Please retry.", 503);
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
