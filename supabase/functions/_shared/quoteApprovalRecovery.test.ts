import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideAlreadyActionedRecovery } from "./quoteApprovalRecovery.ts";

Deno.test("already-actioned quote with unpaid converted job can resend deposit link", () => {
  assertEquals(
    decideAlreadyActionedRecovery({
      convertedJobId: "job-1",
      depositAmount: 5,
      job: { deposit_paid: false, payment_status: "pending" },
    }),
    { action: "resend_deposit_link", status: "deposit_link_needed" },
  );
});

Deno.test("already-actioned quote with paid deposit never sends another payment link", () => {
  assertEquals(
    decideAlreadyActionedRecovery({
      convertedJobId: "job-1",
      depositAmount: 5,
      job: { deposit_paid: true, payment_status: "pending" },
    }),
    { action: "accept_without_resend", status: "already_paid" },
  );

  assertEquals(
    decideAlreadyActionedRecovery({
      convertedJobId: "job-1",
      depositAmount: 5,
      job: { deposit_paid: false, payment_status: "partial" },
    }),
    { action: "accept_without_resend", status: "already_paid" },
  );
});

Deno.test("already-actioned quote without a converted job is not silently accepted", () => {
  assertEquals(
    decideAlreadyActionedRecovery({ convertedJobId: null, depositAmount: 5, job: null }),
    { action: "reject", status: "already_actioned" },
  );
});