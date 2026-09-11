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

export async function fetchReceiptPdf(request: ReceiptPdfRequest): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke<Blob>("stream-receipt-pdf", {
    body: request,
  });
  if (error || !(data instanceof Blob) || !data.type.startsWith("application/pdf")) {
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