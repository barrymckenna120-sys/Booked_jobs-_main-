import { describe, it, expect } from "vitest";
import { shouldSendCancellationNotice } from "../../../supabase/functions/_shared/cancellationNotice";

describe("shouldSendCancellationNotice", () => {
  // Regression: cancelling a duplicate booking used to WhatsApp the customer
  // that their booking was cancelled, even though their real job still stands.
  it("suppresses the customer notice for a duplicate booking", () => {
    expect(shouldSendCancellationNotice("Duplicate Booking")).toBe(false);
    expect(shouldSendCancellationNotice("  duplicate booking ")).toBe(false);
  });

  it("still sends for every other reason", () => {
    for (const reason of [
      "Customer Cancelled",
      "Payment Failed",
      "Engineer Unavailable",
      "No Access – Customer Not Home",
      "Parts Needed",
      "Safety Concern",
      "Other",
    ]) {
      expect(shouldSendCancellationNotice(reason)).toBe(true);
    }
  });

  it("sends when no reason was recorded", () => {
    expect(shouldSendCancellationNotice(null)).toBe(true);
    expect(shouldSendCancellationNotice("")).toBe(true);
  });
});
