export type ReceiptStreamRequest =
  | { kind: "authenticated"; jobId: string; token: string }
  | { kind: "public"; receiptNumber: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReceiptStreamRequest(body: unknown): ReceiptStreamRequest | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const jobId = typeof input.job_id === "string" ? input.job_id : "";
  const token = typeof input.token === "string" ? input.token : "";
  const receiptNumber = typeof input.receipt_number === "string" ? input.receipt_number.trim() : "";

  if (UUID_RE.test(jobId) && UUID_RE.test(token) && !receiptNumber) {
    return { kind: "authenticated", jobId, token };
  }
  if (!jobId && !token && receiptNumber.length > 0 && receiptNumber.length <= 64) {
    return { kind: "public", receiptNumber };
  }
  return null;
}

export function receiptPdfFilename(receiptNumber: unknown): string {
  const safe = String(receiptNumber ?? "receipt").replace(/[^A-Za-z0-9._-]/g, "");
  return `receipt-${safe || "receipt"}.pdf`;
}