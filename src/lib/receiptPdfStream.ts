import { supabase } from "@/integrations/supabase/client";

type ReceiptPdfRequest =
  | { job_id: string; token: string }
  | { receipt_number: string };

export class ReceiptPdfStreamError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ReceiptPdfStreamError";
    this.status = status;
  }
}

export function isReceiptPdfBlob(value: unknown): value is Blob {
  return value instanceof Blob && value.type.startsWith("application/pdf");
}

export async function fetchReceiptPdf(request: ReceiptPdfRequest): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke<Blob>("stream-receipt-pdf", {
    body: request,
  });
  if (error || !isReceiptPdfBlob(data)) {
    const context = (error as { context?: Response | { response?: Response } } | null)?.context;
    const response = context instanceof Response ? context : context?.response;
    throw new ReceiptPdfStreamError("receipt_stream_failed", response?.status ?? null);
  }
  return data;
}

export function openReceiptPdfBlob(pdf: Blob): void {
  const url = URL.createObjectURL(pdf);
  window.addEventListener("pagehide", () => URL.revokeObjectURL(url), { once: true });
  window.location.replace(url);
}

/** Build a safe PDF filename from a receipt number or the stored PDF path. */
export function receiptPdfFilename(source: string | null | undefined): string {
  const raw = String(source ?? "").split("/").pop() ?? "";
  const base = raw.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) return "receipt.pdf";
  return /^receipt/i.test(base) ? `${base}.pdf` : `receipt-${base}.pdf`;
}

export function supportsAnchorDownload(): boolean {
  return typeof document !== "undefined" && "download" in document.createElement("a");
}

/**
 * Hand the PDF to the browser as a file download. Chrome blocks blob-URL tab
 * opens far more readily than downloads; browsers without the download
 * attribute fall back to blob navigation so the tap is never a dead end.
 */
export function downloadReceiptPdf(pdf: Blob, filename: string): boolean {
  if (!supportsAnchorDownload()) {
    openReceiptPdfBlob(pdf);
    return false;
  }
  const url = URL.createObjectURL(pdf);
  window.addEventListener("pagehide", () => URL.revokeObjectURL(url), { once: true });
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}