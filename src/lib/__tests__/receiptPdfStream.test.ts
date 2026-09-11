import { describe, expect, it } from "vitest";
import { isReceiptPdfBlob } from "@/lib/receiptPdfStream";

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