import { describe, it, expect } from "vitest";
import { formatReceiptNumber } from "@/lib/receiptNumber";

describe("formatReceiptNumber", () => {
  it("uses the org prefix and pads the sequence to 4 digits", () => {
    expect(formatReceiptNumber("DG", 2026, 7)).toBe("DG-2026-0007");
  });

  it("falls back to R when no prefix is configured", () => {
    expect(formatReceiptNumber("  ", 2026, 1234)).toBe("R-2026-1234");
    expect(formatReceiptNumber(null, 2026, 12)).toBe("R-2026-0012");
  });
});
