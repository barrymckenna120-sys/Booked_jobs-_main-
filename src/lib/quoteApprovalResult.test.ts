import { describe, expect, it } from "vitest";
import { isQuoteApprovalAccepted } from "./quoteApprovalResult";

describe("isQuoteApprovalAccepted", () => {
  it("accepts explicit backend success", () => {
    expect(isQuoteApprovalAccepted({ success: true })).toBe(true);
  });

  it("does not mask a consumed quote token as success", () => {
    expect(isQuoteApprovalAccepted({ success: false, error: "already_actioned" })).toBe(false);
  });

  it("accepts safe idempotent backend recovery states", () => {
    expect(isQuoteApprovalAccepted({ success: false, status: "deposit_link_sent" })).toBe(true);
    expect(isQuoteApprovalAccepted({ success: false, status: "already_paid" })).toBe(true);
  });
});