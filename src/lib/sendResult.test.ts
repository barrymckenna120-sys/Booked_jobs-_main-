import { describe, it, expect } from "vitest";
import { classifySendResult, describeReason } from "./sendResult";

describe("classifySendResult", () => {
  it("treats a clean send as sent", () => {
    expect(classifySendResult(null, { success: true, sent: true })).toEqual({ status: "sent" });
  });

  it("classifies skipped BEFORE success — 200 with success:true + skipped is not a tick", () => {
    const r = classifySendResult(null, { success: true, sent: false, skipped: true, reason: "opted_out" });
    expect(r.status).toBe("skipped");
    expect(r.message).toBe("customer opted out of messages");
  });

  it("treats sent:false without a skipped flag as skipped, not sent", () => {
    expect(classifySendResult(null, { success: true, sent: false, reason: "no_phone" }).status).toBe("skipped");
  });

  it("supports string skip values (send-deposit-link style)", () => {
    const r = classifySendResult(null, { success: true, skipped: "no_deposit_amount" });
    expect(r).toEqual({ status: "skipped", reason: "no_deposit_amount", message: "no deposit amount on the job" });
  });

  it("classifies success:false as failed with the returned reason", () => {
    const r = classifySendResult(null, { success: false, reason: "whatsapp_send_failed" });
    expect(r.status).toBe("failed");
    expect(r.message).toBe("WhatsApp provider rejected the message");
  });

  it("classifies an invoke error as failed", () => {
    const r = classifySendResult(new Error("boom"), null);
    expect(r.status).toBe("failed");
    expect(r.message).toBe("boom");
  });

  it("fails closed on a missing body", () => {
    expect(classifySendResult(null, null).status).toBe("failed");
  });

  it("fails closed on an unrecognised body", () => {
    expect(classifySendResult(null, { foo: 1 }).status).toBe("failed");
  });
});

describe("describeReason", () => {
  it("maps known reasons", () => {
    expect(describeReason("no_integration")).toBe("WhatsApp is not connected for this business");
  });
  it("falls back to the message then the raw reason", () => {
    expect(describeReason("weird_thing", "provider said no")).toBe("provider said no");
    expect(describeReason("weird_thing")).toBe("weird thing");
    expect(describeReason(null)).toBe("reason not reported");
  });
});
