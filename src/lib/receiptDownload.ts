import { openExternalUrl } from "@/lib/openExternal";

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

/** Open the loading route synchronously while the user's tap is still active. */
export const openReceiptDownload = (
  jobId: string | null | undefined,
  accessToken: string | null | undefined,
  paymentAmount?: number | null,
): boolean => {
  const path = receiptDownloadPath(jobId, accessToken, paymentAmount);
  if (!path) return false;
  openExternalUrl(path);
  return true;
};

export const publicReceiptDownloadPath = (receiptNumber: string | null | undefined): string | null => {
  if (!receiptNumber) return null;
  return `/receipt-public-download/${encodeURIComponent(receiptNumber)}`;
};

export const openPublicReceiptDownload = (receiptNumber: string | null | undefined): boolean => {
  const path = publicReceiptDownloadPath(receiptNumber);
  if (!path) return false;
  openExternalUrl(path);
  return true;
};
