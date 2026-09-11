import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadReceiptPdf,
  isIOSBrowser,
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
  it("is false without a DOM (so callers fall back)", () => {
    expect(supportsAnchorDownload()).toBe(typeof document !== "undefined");
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
const iosUa =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const chromeUa =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const setNavigator = (ua: string, extras: Record<string, unknown> = {}) => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: ua, maxTouchPoints: 0, ...extras },
  });
};

describe("isIOSBrowser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects iPhone and iPadOS-as-Mac", () => {
    setNavigator(iosUa);
    expect(isIOSBrowser()).toBe(true);
    setNavigator("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", { maxTouchPoints: 5 });
    expect(isIOSBrowser()).toBe(true);
  });

  it("does not match desktop Chrome or desktop Safari", () => {
    setNavigator(chromeUa);
    expect(isIOSBrowser()).toBe(false);
    setNavigator("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", { maxTouchPoints: 0 });
    expect(isIOSBrowser()).toBe(false);
  });
});

describe("downloadReceiptPdf", () => {
  afterEach(() => vi.unstubAllGlobals());

  const pdf = () => new Blob(["%PDF-1.4"], { type: "application/pdf" });

  it("shares the PDF file on iOS when the share sheet accepts files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(iosUa, { canShare: () => true, share });
    await expect(downloadReceiptPdf(pdf(), "receipt-KN-1.pdf")).resolves.toBe(true);
    const shared = share.mock.calls[0][0].files[0] as File;
    expect(shared.name).toBe("receipt-KN-1.pdf");
    expect(shared.type).toBe("application/pdf");
  });

  it("reports no save when the user cancels the iOS share sheet", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    setNavigator(iosUa, { canShare: () => true, share: vi.fn().mockRejectedValue(abort) });
    await expect(downloadReceiptPdf(pdf(), "receipt-KN-1.pdf")).resolves.toBe(false);
  });

  const stubDom = () => {
    const click = vi.fn();
    const link: Record<string, unknown> = { click, remove: vi.fn(), rel: "", download: "", href: "" };
    vi.stubGlobal("document", {
      createElement: () => link,
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal("window", { addEventListener: vi.fn(), setTimeout: vi.fn() });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    return { click, link };
  };

  it("falls back to the anchor download when iOS cannot share files", async () => {
    setNavigator(iosUa, { canShare: () => false, share: vi.fn() });
    const { click, link } = stubDom();
    await expect(downloadReceiptPdf(pdf(), "receipt-KN-1.pdf")).resolves.toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(link.download).toBe("receipt-KN-1.pdf");
  });

  it("keeps the direct download path on non-iOS browsers", async () => {
    const share = vi.fn();
    setNavigator(chromeUa, { canShare: () => true, share });
    const { click } = stubDom();
    await expect(downloadReceiptPdf(pdf(), "receipt-KN-1.pdf")).resolves.toBe(true);
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });
});

