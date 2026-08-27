import { describe, it, expect } from "vitest";
import { classifyDepositStage } from "../../../supabase/functions/_shared/quoteApprovalStages";

describe("classifyDepositStage", () => {
  it("reports success when the link was created and the WhatsApp went out", () => {
    expect(
      classifyDepositStage({ ok: true, sent: true, paymentLink: "https://pay/x" }),
    ).toEqual({ success: true, status: "deposit_link_sent" });
  });

  it("treats a reused pending checkout as success (no duplicate send)", () => {
    expect(
      classifyDepositStage({
        ok: true,
        skipped: "checkout_already_pending",
        paymentLink: "https://pay/x",
        reused: true,
      }),
    ).toEqual({ success: true, status: "deposit_link_already_pending" });
  });

  it("treats no deposit due and opted-out customers as success", () => {
    expect(classifyDepositStage({ ok: true, skipped: "no_deposit_amount" }).success).toBe(true);
    expect(classifyDepositStage({ ok: true, skipped: "opted_out" }).status).toBe("opted_out");
  });

  // Regression: these used to be swallowed as "ok", so the office believed a
  // deposit link had been sent when nothing left the building.
  it("fails on a missing phone number, attributed to the deposit_link stage", () => {
    const out = classifyDepositStage({ ok: true, skipped: "no_phone" });
    expect(out).toMatchObject({ success: false, stage: "deposit_link", status: "no_phone" });
  });

  it("fails on missing payment credentials", () => {
    const out = classifyDepositStage({ ok: true, skipped: "no_sumup_credentials", error: "no key" });
    expect(out.success).toBe(false);
    expect(out.stage).toBe("deposit_link");
  });

  it("blames whatsapp_send when a link exists but the send was skipped", () => {
    const out = classifyDepositStage({
      ok: true,
      skipped: "no_whatsapp_key",
      paymentLink: "https://pay/x",
    });
    expect(out).toMatchObject({ success: false, stage: "whatsapp_send" });
  });

  it("fails when checkout creation errored", () => {
    const out = classifyDepositStage({ ok: false, error: "sumup_checkout_failed" });
    expect(out).toMatchObject({ success: false, stage: "deposit_link", error: "sumup_checkout_failed" });
  });

  it("fails when there is no job to attach the deposit to", () => {
    expect(classifyDepositStage({ ok: false, skipped: "no_service_call" }).success).toBe(false);
  });

  it("fails when the send silently reported not-sent", () => {
    const out = classifyDepositStage({ ok: true, sent: false, paymentLink: "https://pay/x" });
    expect(out).toMatchObject({ success: false, stage: "whatsapp_send" });
  });

  it("fails on a missing result", () => {
    expect(classifyDepositStage(null).success).toBe(false);
  });
});
