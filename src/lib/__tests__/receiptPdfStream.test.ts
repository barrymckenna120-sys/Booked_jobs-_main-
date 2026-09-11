import { describe, expect, it } from "vitest";
import {
  isReceiptPdfBlob,
  receiptPdfFilename,
  supportsAnchorDownload,
} from "@/lib/receiptPdfStream";

describe("receiptPdfFilename", () => {
  it("uses the stored PDF filename", () => {
    expect(receiptPdfFilename("8c37827f/receipt-KN-2026-1028.pdf")).toBe("receipt-KN-2026-1028.pdf");
  });

  it("builds a filename from a receipt number", () => {
    expect(receiptPdfFilename("DG-2026-9817")).toBe("receipt-DG-2026-9817.pdf");
  });

  it("strips unsafe characters and falls back", () => {
    expect(receiptPdfFilename('DG "2026"/../x')).toBe("receipt-x.pdf");
    expect(receiptPdfFilename(null)).toBe("receipt.pdf");
  });
});

describe("supportsAnchorDownload", () => {
  it("is true in a DOM environment", () => {
    expect(supportsAnchorDownload()).toBe(true);
  });
});

describe("isReceiptPdfBlob", () => {
  it("accepts a streamed PDF blob", () => {
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    expect(isReceiptPdfBlob(pdf)).toBe(true);
  });

  it("rejects a non-PDF response", () => {
    expect(isReceiptPdfBlob(new Blob(["error"], { type: "application/json" }))).toBe(false);
    expect(isReceiptPdfBlob(null)).toBe(false);
  });
});