import { describe, expect, it } from "vitest";
import {
  canResendDelivery,
  deliveryBadgeLabel,
  deliveryDetailLine,
} from "../deliveryStatus";
import {
  canResend,
  humanFailureReason,
} from "../../../supabase/functions/_shared/deliveryReason";

describe("delivery badge presentation", () => {
  it("labels each state consistently", () => {
    expect(deliveryBadgeLabel("sent", "whatsapp")).toBe("Sent · WhatsApp");
    expect(deliveryBadgeLabel("sent", "email")).toBe("Sent · Email");
    expect(deliveryBadgeLabel("failed", "whatsapp")).toBe("Not delivered");
    expect(deliveryBadgeLabel("opted_out", "whatsapp")).toBe("Opted out");
    expect(deliveryBadgeLabel("pending", "whatsapp")).toBe("Sending…");
    expect(deliveryBadgeLabel(null, "whatsapp")).toBe("Not sent");
  });

  it("only offers resend for failures", () => {
    expect(canResendDelivery("failed")).toBe(true);
    for (const s of ["sent", "opted_out", "pending", null, undefined]) {
      expect(canResendDelivery(s as string)).toBe(false);
    }
    expect(canResend("failed")).toBe(true);
    expect(canResend("opted_out")).toBe(false);
  });

  it("shows the stored public reason, with attempt count when retried", () => {
    expect(
      deliveryDetailLine({
        delivery_status: "failed",
        channel: "whatsapp",
        failure_reason_public: "This number is not on WhatsApp",
        attempt_count: 1,
      }),
    ).toBe("This number is not on WhatsApp");

    expect(
      deliveryDetailLine({
        delivery_status: "failed",
        channel: "whatsapp",
        failure_reason_public: "This number is not on WhatsApp",
        attempt_count: 3,
      }),
    ).toBe("This number is not on WhatsApp · 3 attempts");
  });

  it("explains opt-out without calling it a failure", () => {
    expect(
      deliveryDetailLine({
        delivery_status: "opted_out",
        channel: "whatsapp",
        failure_reason_public: null,
        attempt_count: 1,
      }),
    ).toBe("Not sent – customer opted out of messages");
  });

  it("shows nothing extra for successful sends", () => {
    expect(
      deliveryDetailLine({
        delivery_status: "sent",
        channel: "whatsapp",
        failure_reason_public: null,
        attempt_count: 1,
      }),
    ).toBe("");
  });
});

describe("humanFailureReason never leaks provider noise", () => {
  it("maps common provider failures to office-readable copy", () => {
    expect(humanFailureReason("[400] {\"error\":\"invalid number\"}", "whatsapp")).toBe(
      "The customer's number appears to be invalid",
    );
    expect(humanFailureReason("recipient is not on whatsapp", "whatsapp")).toBe(
      "This number is not on WhatsApp",
    );
    expect(humanFailureReason("[403] Forbidden", "whatsapp")).toBe(
      "WhatsApp sending is not set up correctly — contact support",
    );
    expect(humanFailureReason("429 Too Many Requests", "whatsapp")).toBe(
      "Sending limit reached — try again shortly",
    );
    expect(humanFailureReason("fetch failed: ECONNRESET", "email")).toBe(
      "The messaging service could not be reached",
    );
    expect(humanFailureReason("mailbox unavailable", "email")).toBe(
      "The customer's email address was rejected",
    );
    expect(humanFailureReason("customer has no phone", "whatsapp")).toBe(
      "No contact details on the customer record",
    );
  });

  it("falls back to a generic line and never echoes the raw error", () => {
    const raw = "TypeError: Cannot read properties of undefined (reading 'sid')";
    const out = humanFailureReason(raw, "sms");
    expect(out).toBe("SMS could not be delivered");
    expect(out).not.toContain("TypeError");
  });

  it("handles an empty error", () => {
    expect(humanFailureReason(null, "whatsapp")).toBe("WhatsApp could not be delivered");
  });
});
