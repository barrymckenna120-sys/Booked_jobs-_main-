import { describe, expect, it } from "vitest";
import { publicReceiptDownloadPath, receiptDownloadPath } from "@/lib/receiptDownload";

describe("receiptDownloadPath", () => {
  it("builds a same-origin loading route", () => {
    expect(receiptDownloadPath("job-1", "token-1")).toBe(
      "/receipt-download/job-1?token=token-1",
    );
  });

  it("encodes route values", () => {
    expect(receiptDownloadPath("job/1", "token?1")).toBe(
      "/receipt-download/job%2F1?token=token%3F1",
    );
  });

  it("preserves an exact payment amount for receipt regeneration", () => {
    expect(receiptDownloadPath("job-1", "token-1", 1537.5)).toBe(
      "/receipt-download/job-1?token=token-1&amount=1537.5",
    );
  });

  it("requires both identifiers", () => {
    expect(receiptDownloadPath("job-1", null)).toBeNull();
    expect(receiptDownloadPath(null, "token-1")).toBeNull();
  });

  it("builds a public download route without exposing a private access token", () => {
    expect(publicReceiptDownloadPath("DG-2026-9817")).toBe(
      "/receipt-public-download/DG-2026-9817",
    );
  });
});
