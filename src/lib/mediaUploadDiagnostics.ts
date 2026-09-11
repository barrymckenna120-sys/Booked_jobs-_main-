/**
 * Diagnostics + bounded retry for engineer job-media photo uploads.
 *
 * Background: after the storage-path fix, a first upload straight after app
 * launch still failed once on a real iPhone while the retry succeeded, and the
 * backend logs showed no request at all (no storage 4xx, no RLS violation).
 * A request that never reaches the server leaves no trace, so this module
 * (a) reports the exact client-side failure to monitoring, and (b) retries once
 * — and ONLY once, and ONLY for genuine connectivity failures. A permission or
 * validation failure must always surface immediately and never be retried.
 */
import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";
import { withRequestTimeout } from "@/lib/queryDefaults";
import { isTransientWriteError } from "@/lib/paymentWriteDiagnostics";
import { buildSentryTags } from "@/lib/sentryContext";

/** Genuine connectivity/timeout failure — the only case worth retrying. */
export const isTransientUploadError = (error: unknown): boolean =>
  isTransientWriteError(error);

export interface MediaUploadFailureContext {
  /** Which screen produced the upload, e.g. "MediaSheet". */
  surface: string;
  /** Which part of the flow failed. */
  stage: "storage_upload" | "job_media_insert";
  jobId: string;
  customerId: string;
  storagePath: string;
  /** 1 = first attempt, 2 = the single retry. */
  attempt: number;
  /** Whether a signed-in session existed at the moment of the attempt. */
  hadSession: boolean;
  error: unknown;
}

/** Structured, greppable log + monitoring report of a failed media upload. */
export const reportMediaUploadFailure = (
  ctx: MediaUploadFailureContext
): void => {
  const error = ctx.error as any;
  const payload = {
    surface: ctx.surface,
    stage: ctx.stage,
    jobId: ctx.jobId,
    customerId: ctx.customerId,
    storagePath: ctx.storagePath,
    attempt: ctx.attempt,
    hadSession: ctx.hadSession,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    errorName: error?.name ?? null,
    errorCode: error?.code ?? error?.statusCode ?? null,
    errorStatus: error?.status ?? null,
    errorMessage: error?.message ?? String(ctx.error ?? ""),
    transient: isTransientUploadError(ctx.error),
  };

  console.error("[mediaUpload]", payload);

  try {
    Sentry.captureException(
      error instanceof Error
        ? error
        : new Error(`media upload failed: ${payload.errorMessage}`),
      {
        tags: {
          ...buildSentryTags(),
          feature: "job_media_upload",
          surface: ctx.surface,
          upload_stage: ctx.stage,
          upload_attempt: String(ctx.attempt),
          upload_transient: String(payload.transient),
        },
        extra: payload,
      }
    );
  } catch {
    // Monitoring must never break an upload.
  }
};

/**
 * Resolves once a signed-in session is available (or we know there isn't one).
 * Right after app launch on iOS the session is still being restored; firing the
 * upload before that is the most likely cause of the first-attempt failure.
 */
export const ensureSessionReady = async (): Promise<boolean> => {
  try {
    const { data } = (await withRequestTimeout(
      supabase.auth.getSession(),
      8000
    )) as { data?: { session?: unknown } };
    return !!data?.session;
  } catch {
    return false;
  }
};

interface SupabaseResult {
  error: unknown;
}

/**
 * Runs an upload step, retrying exactly once when the failure is a genuine
 * connectivity problem. Permission/validation failures are returned untouched
 * so the engineer still sees the real error straight away.
 */
export async function runUploadWithRetry<T extends SupabaseResult>(
  operation: (attempt: number) => Promise<T>,
  ctx: Omit<MediaUploadFailureContext, "attempt" | "error">
): Promise<T> {
  const first = await operation(1);
  if (!first.error) return first;

  reportMediaUploadFailure({ ...ctx, attempt: 1, error: first.error });

  if (!isTransientUploadError(first.error)) return first;

  const second = await operation(2);
  if (second.error) {
    reportMediaUploadFailure({ ...ctx, attempt: 2, error: second.error });
  }
  return second;
}
