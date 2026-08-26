import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCancelUpdate, cancelAuditDetail, reversesConfirmation } from "./cancelUpdate.ts";

const now = new Date("2026-08-26T11:09:11.000Z");

Deno.test("cancel clears a stale confirmation (regression: DG-439 confirmed+cancelled)", () => {
  const patch = buildCancelUpdate({ id: "j1", confirmed: true }, "ZZ SCRATCH 2Day DG Test", now);
  assertEquals(patch.status, "Cancelled");
  assertEquals(patch.confirmed, false);
  assertEquals(patch.confirmed_at, null);
  assertEquals(patch.cancelled_at, "2026-08-26T11:09:11.000Z");
});

Deno.test("every WhatsApp cancel raises an office follow-up", () => {
  for (const confirmed of [true, false, null]) {
    const patch = buildCancelUpdate({ id: "j1", confirmed }, "Mary", now);
    assertEquals(patch.follow_up_needed, true);
    assertEquals(patch.follow_up_resolved, false);
    assertEquals(patch.follow_up_detail.includes("mistake"), true);
  }
});

Deno.test("follow-up wording and audit detail flag a reversed confirmation", () => {
  assertEquals(reversesConfirmation({ id: "j1", confirmed: true }), true);
  assertEquals(reversesConfirmation({ id: "j1", confirmed: null }), false);

  const reversed = buildCancelUpdate({ id: "j1", confirmed: true }, "Mary", now);
  assertEquals(reversed.follow_up_detail.startsWith("Mary confirmed by WhatsApp and then replied CANCEL"), true);
  assertEquals(
    cancelAuditDetail({ id: "j1", confirmed: true }),
    "Cancelled: Customer cancelled via WhatsApp (reversed an earlier WhatsApp confirmation)",
  );

  const plain = buildCancelUpdate({ id: "j1", confirmed: false }, "Mary", now);
  assertEquals(plain.follow_up_detail.startsWith("Mary cancelled by WhatsApp reply"), true);
  assertEquals(cancelAuditDetail({ id: "j1", confirmed: false }), "Cancelled: Customer cancelled via WhatsApp");
});

Deno.test("missing customer name falls back to 'Customer'", () => {
  const patch = buildCancelUpdate({ id: "j1", confirmed: true }, "   ", now);
  assertEquals(patch.follow_up_detail.startsWith("Customer confirmed by WhatsApp"), true);
});
