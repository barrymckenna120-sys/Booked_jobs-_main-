import { openExternalUrl } from "@/lib/openExternal";

export const receiptDownloadPath = (
  jobId: string | null | undefined,
  accessToken: string | null | undefined,
): string | null => {
  if (!jobId || !accessToken) return null;
  return `/receipt-download/${encodeURIComponent(jobId)}?token=${encodeURIComponent(accessToken)}`;
};

/** Open the loading route synchronously while the user's tap is still active. */
export const openReceiptDownload = (
  jobId: string | null | undefined,
  accessToken: string | null | undefined,
): boolean => {
  const path = receiptDownloadPath(jobId, accessToken);
  if (!path) return false;
  openExternalUrl(path);
  return true;
};
