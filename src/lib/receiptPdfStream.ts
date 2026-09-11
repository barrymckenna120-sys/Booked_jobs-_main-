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
 * iOS Safari ignores the anchor `download` attribute for PDFs and displays the
 * document instead, so the only way to hand over a real file is the system
 * share sheet ("Save to Files").
 */
export function isIOSBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports itself as Macintosh; touch points give it away.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

type FileShareNavigator = Navigator & {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
};

function fileShareNavigator(pdf: Blob, filename: string): { nav: FileShareNavigator; file: File } | null {
  if (typeof navigator === "undefined" || typeof File === "undefined") return null;
  const nav = navigator as FileShareNavigator;
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return null;
  const file = new File([pdf], filename, { type: "application/pdf" });
  if (!nav.canShare({ files: [file] })) return null;
  return { nav, file };
}

function anchorDownload(pdf: Blob, filename: string): boolean {
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

/**
 * Hand the PDF to the browser as a file. Chrome blocks blob-URL tab opens far
 * more readily than downloads, so non-iOS browsers download in place; iOS gets
 * the share sheet so the file can be saved rather than merely displayed.
 * Resolves true when the receipt was saved/handed over, false when the user
 * cancelled or the browser could only display it.
 */
export async function downloadReceiptPdf(pdf: Blob, filename: string): Promise<boolean> {
  if (isIOSBrowser()) {
    const shareable = fileShareNavigator(pdf, filename);
    if (shareable) {
      try {
        await shareable.nav.share!({ files: [shareable.file], title: filename });
        return true;
      } catch (error) {
        // User dismissed the sheet — not a failure, and not a success toast.
        if ((error as { name?: string } | null)?.name === "AbortError") return false;
      }
    }
  }
  return anchorDownload(pdf, filename);
}
