import * as tus from 'tus-js-client';
import { createClient } from '@/lib/supabase/client';

/**
 * Resumable upload to Supabase Storage via the TUS protocol.
 *
 * Supabase's standard single-PUT upload has plan-dependent size caps (50 MB
 * on Free, 5 GB on Pro). Resumable uploads survive any plan limit and any
 * flaky wifi — the upload is chunked and progress is checkpointed server-side,
 * so a failed connection just resumes from where it left off.
 *
 * Use this for any file bigger than the standard limit. For small files
 * (< 6 MB) the single-PUT path in supabase-js is still faster.
 */
export interface TusUploadOptions {
  file: File;
  bucket: string;
  objectName: string;
  contentType?: string;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

export async function tusUpload({
  file,
  bucket,
  objectName,
  contentType,
  onProgress,
  signal,
}: TusUploadOptions): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('not_authenticated');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing');

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
      headers: {
        'x-upsert': 'false',
      },
      // Attach a CURRENT access token to every request (create + each PATCH
      // chunk). A long multi-file batch can outlive the token grabbed at the
      // start; a stale token gets the chunk rejected at the gateway (HTTP 400/
      // 401). getSession() auto-refreshes, so this always sends a live token.
      async onBeforeRequest(req) {
        const {
          data: { session: live },
        } = await supabase.auth.getSession();
        const token = live?.access_token ?? session.access_token;
        req.setHeader('authorization', `Bearer ${token}`);
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024, // 6 MB chunks (Supabase recommended minimum)
      metadata: {
        bucketName: bucket,
        objectName,
        contentType: contentType ?? 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: (err) => reject(err),
      onProgress: (sent, total) => onProgress?.(sent, total),
      onSuccess: () => resolve(),
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        upload.abort();
        reject(new Error('aborted'));
      });
    }

    // Resume if a previous attempt for this file is still in the server.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}

/** Threshold above which we use TUS resumable uploads. */
export const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024;
