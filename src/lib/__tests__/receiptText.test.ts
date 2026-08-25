import { describe, it, expect } from "vitest";
import { buildReceiptText } from "../receiptText";

describe("buildReceiptText", () => {
  it("builds full receipt text", () => {
    const text = buildReceiptText({
      receipt_number: "KN-2026-0001",
      scheduled_date: "2026-08-20",
      paid_at: "2026-08-21T10:00:00Z",
      revenue: 400,
      payment_method: "card",
      assigned_engineer: "Karl",
      customerName: "Barry McKenna",
    });
    expect(text).toContain("Receipt KN-2026-0001");
    expect(text).toContain("Customer: Barry McKenna");
    expect(text).toContain("Method: Card");
    expect(text).toContain("Engineer: Karl");
    expect(text).toContain("Amount: €400.00");
    expect(text).toContain("20 Aug 2026");
  });

  it("returns null when there is no receipt number", () => {
    expect(
      buildReceiptText({
        receipt_number: null,
        scheduled_date: null,
        paid_at: null,
        revenue: null,
        payment_method: null,
        assigned_engineer: null,
      }),
    ).toBeNull();
  });

  it("omits missing fields and defaults amount", () => {
    const text = buildReceiptText({
      receipt_number: "KN-1",
      scheduled_date: null,
      paid_at: null,
      revenue: null,
      payment_method: null,
      assigned_engineer: null,
    });
    expect(text).toBe("Receipt KN-1\nAmount: €0.00");
  });
});
