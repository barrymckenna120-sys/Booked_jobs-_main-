import { afterEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { fetchReceiptPdf, ReceiptPdfStreamError } from "@/lib/receiptPdfStream";

describe("fetchReceiptPdf", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a streamed PDF blob", async () => {
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    vi.spyOn(supabase.functions, "invoke").mockResolvedValue({ data: pdf, error: null } as never);

    await expect(fetchReceiptPdf({ job_id: "job-id", token: "token-id" })).resolves.toBe(pdf);
    expect(supabase.functions.invoke).toHaveBeenCalledWith("stream-receipt-pdf", {
      body: { job_id: "job-id", token: "token-id" },
    });
  });

  it("rejects a non-PDF response", async () => {
    vi.spyOn(supabase.functions, "invoke").mockResolvedValue({
      data: new Blob(["error"], { type: "application/json" }),
      error: null,
    } as never);

    await expect(fetchReceiptPdf({ receipt_number: "DG-2026-9817" })).rejects.toBeInstanceOf(
      ReceiptPdfStreamError,
    );
  });
});