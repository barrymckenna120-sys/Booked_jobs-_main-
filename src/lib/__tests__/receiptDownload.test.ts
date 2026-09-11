import { describe, expect, it } from "vitest";
import {
  classifyReceiptDownloadError,
  downloadJobReceipt,
  downloadPublicReceipt,
  publicReceiptDownloadPath,
  receiptDownloadCopy,
  receiptDownloadPath,
} from "@/lib/receiptDownload";
import { RequestTimeoutError } from "@/lib/queryDefaults";
import { ReceiptPdfStreamError } from "@/lib/receiptPdfStream";

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

describe("downloadJobReceipt", () => {
  it("reports an unavailable receipt when identifiers are missing", async () => {
    expect(await downloadJobReceipt(null, "token-1")).toEqual({ ok: false, failure: "unavailable" });
    expect(await downloadJobReceipt("job-1", null)).toEqual({ ok: false, failure: "unavailable" });
  });

  it("reports an unavailable receipt when no receipt number is given", async () => {
    expect(await downloadPublicReceipt(null)).toEqual({ ok: false, failure: "unavailable" });
  });
});

describe("classifyReceiptDownloadError", () => {
  it("maps timeouts", () => {
    expect(classifyReceiptDownloadError(new RequestTimeoutError("slow"))).toBe("timeout");
  });

  it("maps access denials", () => {
    expect(classifyReceiptDownloadError(new ReceiptPdfStreamError("nope", 401))).toBe("forbidden");
    expect(classifyReceiptDownloadError(new ReceiptPdfStreamError("nope", 403))).toBe("forbidden");
    expect(classifyReceiptDownloadError(new ReceiptPdfStreamError("nope", 404))).toBe("forbidden");
  });

  it("falls back to a retryable failure when online", () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    expect(classifyReceiptDownloadError(new ReceiptPdfStreamError("boom", 500))).toBe("resolve");
    expect(classifyReceiptDownloadError(new Error("boom"))).toBe("resolve");
    Object.defineProperty(navigator, "onLine", { value: original, configurable: true });
  });

  it("reports offline when the browser is offline", () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(classifyReceiptDownloadError(new Error("boom"))).toBe("offline");
    Object.defineProperty(navigator, "onLine", { value: original, configurable: true });
  });
});

describe("receiptDownloadCopy", () => {
  it("has user-facing copy for every failure", () => {
    for (const failure of ["offline", "timeout", "generate", "resolve", "forbidden", "unavailable"] as const) {
      expect(receiptDownloadCopy[failure].title.length).toBeGreaterThan(0);
      expect(receiptDownloadCopy[failure].description.length).toBeGreaterThan(0);
    }
  });
});
