import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { RESUMABLE_BYTES } from "./schema";

export type SignedUpload = { bucket: string; path: string; token: string };

/**
 * Upload one file with a signed upload token the server issued. The person
 * uploading has no account, so the token is the only authorization.
 *
 * Small files go up in one request. Larger ones use Supabase's resumable (TUS)
 * endpoint in 6 MB chunks, so a dropped connection resumes instead of starting
 * a large video over.
 */
export async function uploadSigned(
  file: File,
  signed: SignedUpload,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const contentType = file.type || "application/octet-stream";
  if (file.size <= RESUMABLE_BYTES) {
    const { error } = await createClient()
      .storage.from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, file, { contentType, upsert: true });
    if (error) throw new Error(error.message);
    onProgress(1);
    return;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Uploads are not configured.");
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        "x-signature": signed.token,
        "x-upsert": "true",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_BYTES, // Supabase requires exactly 6 MB chunks
      metadata: {
        bucketName: signed.bucket,
        objectName: signed.path,
        contentType,
        cacheControl: "3600",
      },
      onError: (err) => reject(err),
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
