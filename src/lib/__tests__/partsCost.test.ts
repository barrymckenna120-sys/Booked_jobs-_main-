import { describe, expect, it } from "vitest";
import {
  canEditPartsOfficeFields,
  costVariance,
  formatExpectedDelivery,
  formatPartCost,
  isDeliveryOverdue,
  stripPartsCostFields,
} from "../partsCost";

describe("formatPartCost", () => {
  it("formats euro amounts to two decimals", () => {
    expect(formatPartCost(124.5)).toBe("€124.50");
    expect(formatPartCost("89")).toBe("€89.00");
  });

  it("returns empty string when there is no cost", () => {
    expect(formatPartCost(null)).toBe("");
    expect(formatPartCost(undefined)).toBe("");
    expect(formatPartCost("")).toBe("");
    expect(formatPartCost("abc")).toBe("");
  });

  it("keeps zero as a real value, not a blank", () => {
    expect(formatPartCost(0)).toBe("€0.00");
  });
});

describe("costVariance", () => {
  it("needs both figures", () => {
    expect(costVariance(null, 100)).toBeNull();
    expect(costVariance(100, null)).toBeNull();
  });

  it("flags an overspend", () => {
    const v = costVariance(100, 130)!;
    expect(v.state).toBe("over");
    expect(v.label).toBe("€30.00 over");
  });

  it("flags coming in cheaper", () => {
    const v = costVariance(100, 82.5)!;
    expect(v.state).toBe("under");
    expect(v.label).toBe("€17.50 under");
  });

  it("reports on budget for an exact match", () => {
    const v = costVariance(100, 100)!;
    expect(v.state).toBe("on_budget");
    expect(v.delta).toBe(0);
  });
});

describe("formatExpectedDelivery", () => {
  it("keeps the stored date in Europe/Dublin rather than shifting a day back", () => {
    expect(formatExpectedDelivery("2026-08-14")).toBe("Fri 14 Aug 2026");
  });

  it("returns empty string for missing or unusable values", () => {
    expect(formatExpectedDelivery(null)).toBe("");
    expect(formatExpectedDelivery("not-a-date")).toBe("");
  });
});

describe("isDeliveryOverdue", () => {
  const past = "2020-01-01";
  const future = "2999-01-01";

  it("is overdue when the ETA has passed and the part isn't in yet", () => {
    expect(isDeliveryOverdue(past, "Ordered")).toBe(true);
  });

  it("is not overdue once the part is ready or cancelled", () => {
    expect(isDeliveryOverdue(past, "Ready to Fit")).toBe(false);
    expect(isDeliveryOverdue(past, "Cancelled")).toBe(false);
  });

  it("is not overdue for a future ETA or no ETA", () => {
    expect(isDeliveryOverdue(future, "Ordered")).toBe(false);
    expect(isDeliveryOverdue(null, "Ordered")).toBe(false);
  });
});

describe("stripPartsCostFields", () => {
  it("removes supplier cost keys so they can never reach a pricing patch", () => {
    const cleaned = stripPartsCostFields({
      status: "parts_ordered",
      quoted_cost: 100,
      actual_cost: 130,
      expected_delivery_date: "2026-08-14",
      quote_reference: "Q-1",
      customer_notified_at: "2026-08-14T07:27:00Z",
    } as any);
    expect(cleaned).toEqual({ status: "parts_ordered" });
  });

  it("also strips revenue and balance keys a parts flow has no business setting", () => {
    const cleaned = stripPartsCostFields({
      status: "parts_arrived",
      revenue: 500,
      balance_due: 200,
      payment_status: "paid",
      deposit_amount: 100,
    } as any);
    expect(cleaned).toEqual({ status: "parts_arrived" });
  });

  it("leaves unrelated patches untouched", () => {
    const patch = { status: "Ordered", notes: "ordered from supplier" };
    expect(stripPartsCostFields(patch)).toEqual(patch);
  });
});

describe("canEditPartsOfficeFields", () => {
  it("allows office-side roles only", () => {
    ["admin", "owner", "office", "manager", "superadmin"].forEach((r) =>
      expect(canEditPartsOfficeFields(r)).toBe(true),
    );
    expect(canEditPartsOfficeFields("engineer")).toBe(false);
    expect(canEditPartsOfficeFields(null)).toBe(false);
  });
});
