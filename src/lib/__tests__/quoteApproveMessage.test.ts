import { describe, it, expect } from "vitest";
import { buildApproveToast } from "../quoteApproveMessage";

describe("buildApproveToast", () => {
  it("confirms the full happy sequence", () => {
    const t = buildApproveToast({ success: true, approved: true, status: "deposit_link_sent" });
    expect(t.variant).toBeUndefined();
    expect(t.description).toMatch(/deposit link sent/i);
  });

  it("says no duplicate was sent when a valid link already existed", () => {
    const t = buildApproveToast({ success: true, status: "deposit_link_already_pending" });
    expect(t.description).toMatch(/no duplicate/i);
  });

  it("explains a zero-deposit quote instead of implying a link went out", () => {
    const t = buildApproveToast({ success: true, status: "no_deposit_amount" });
    expect(t.description).toMatch(/No deposit due/i);
  });

  // Regression: a failed deposit stage used to surface as a generic "Error"
  // while the quote was in fact approved.
  it("names the failing stage but keeps the approval visible", () => {
    const t = buildApproveToast({
      success: false,
      approved: true,
      stage: "deposit_link",
      status: "no_phone",
    });
    expect(t.title).toMatch(/approved, but creating the deposit payment link failed/i);
    expect(t.description).toMatch(/no mobile number/i);
    expect(t.variant).toBe("destructive");
  });

  it("blames the WhatsApp stage when only the send failed", () => {
    const t = buildApproveToast({
      success: false,
      approved: true,
      stage: "whatsapp_send",
      status: "no_whatsapp_key",
    });
    expect(t.title).toMatch(/sending the deposit WhatsApp failed/i);
  });

  it("reports a hard approval failure when the quote was not approved", () => {
    const t = buildApproveToast({ success: false, error: "duplicate key value" });
    expect(t.title).toBe("Couldn't approve quote");
    expect(t.description).toMatch(/duplicate key/);
  });

  it("falls back to the transport error when there is no response body", () => {
    const t = buildApproveToast(null, "Edge Function returned 500");
    expect(t.description).toBe("Edge Function returned 500");
    expect(t.variant).toBe("destructive");
  });
});
