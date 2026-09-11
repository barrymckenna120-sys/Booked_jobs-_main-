import { invokeFunction } from "@/lib/invokeFunction";
import { RequestTimeoutError, withRequestTimeout } from "@/lib/queryDefaults";
import {
  downloadReceiptPdf,
  fetchReceiptPdf,
  receiptPdfFilename,
  ReceiptPdfStreamError,
} from "@/lib/receiptPdfStream";

export type ReceiptDownloadFailure =
  | "offline"
  | "timeout"
  | "generate"
  | "resolve"
  | "forbidden"
  | "unavailable";

export type ReceiptDownloadResult = { ok: boolean; failure?: ReceiptDownloadFailure };

export const receiptDownloadCopy: Record<ReceiptDownloadFailure, { title: string; description: string }> = {
  offline: { title: "You're offline", description: "Reconnect and try again." },
  timeout: {
    title: "Receipt took too long",
    description: "Check your signal and try again.",
  },
  generate: { title: "Couldn't prepare receipt", description: "The receipt PDF couldn't be prepared. Please try again." },
  resolve: { title: "Couldn't download receipt", description: "The receipt PDF couldn't be downloaded. Please try again." },
  forbidden: { title: "Receipt unavailable", description: "This receipt is unavailable or you don't have access to it." },
  unavailable: { title: "Receipt unavailable", description: "This receipt link is unavailable." },
};

/** Routes kept for links already shared; the buttons download in place instead. */
export const receiptDownloadPath = (
  jobId: string | null | undefined,
  accessToken: string | null | undefined,
  paymentAmount?: number | null,
): string | null => {
  if (!jobId || !accessToken) return null;
  const params = new URLSearchParams({ token: accessToken });
  if (typeof paymentAmount === "number" && Number.isFinite(paymentAmount) && paymentAmount > 0) {
    params.set("amount", String(paymentAmount));
  }
  return `/receipt-download/${encodeURIComponent(jobId)}?${params.toString()}`;
};

export const publicReceiptDownloadPath = (receiptNumber: string | null | undefined): string | null => {
  if (!receiptNumber) return null;
  return `/receipt-public-download/${encodeURIComponent(receiptNumber)}`;
};

export function classifyReceiptDownloadError(error: unknown): ReceiptDownloadFailure {
  if (error instanceof RequestTimeoutError) return "timeout";
  if (
    error instanceof ReceiptPdfStreamError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  ) {
    return "forbidden";
  }
  return typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "resolve";
}

/**
 * Download the receipt PDF from the current page — no new tab, no blob-URL
 * navigation, so extensions that block blob tab-opens can't break the flow.
 */
export async function downloadJobReceipt(
  jobId: string | null | undefined,
  accessToken: string | null | undefined,
  paymentAmount?: number | null,
): Promise<ReceiptDownloadResult> {
  if (!jobId || !accessToken) return { ok: false, failure: "unavailable" };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, failure: "offline" };

  const exactAmount =
    typeof paymentAmount === "number" && Number.isFinite(paymentAmount) && paymentAmount > 0
      ? paymentAmount
      : null;

  try {
    const { data, error } = await withRequestTimeout(
      invokeFunction<{ pdf_url?: string }>("generate-receipt-pdf", {
        body: exactAmount ? { job_id: jobId, payment_amount: exactAmount } : { job_id: jobId },
        signOutOnRefreshFailure: false,
      }),
    );
    if (error || !data?.pdf_url) return { ok: false, failure: "generate" };

    const pdf = await withRequestTimeout(fetchReceiptPdf({ job_id: jobId, token: accessToken }));
    await downloadReceiptPdf(pdf, receiptPdfFilename(data.pdf_url));
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: classifyReceiptDownloadError(error) };
  }
}

export async function downloadPublicReceipt(
  receiptNumber: string | null | undefined,
): Promise<ReceiptDownloadResult> {
  if (!receiptNumber) return { ok: false, failure: "unavailable" };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, failure: "offline" };

  try {
    const pdf = await withRequestTimeout(fetchReceiptPdf({ receipt_number: receiptNumber }));
    downloadReceiptPdf(pdf, receiptPdfFilename(receiptNumber));
    return { ok: true };
  } catch (error) {
    return { ok: false, failure: classifyReceiptDownloadError(error) };
  }
}
