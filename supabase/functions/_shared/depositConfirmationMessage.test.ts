import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildDepositConfirmationMessage,
  formatEuro,
  shouldSendDepositConfirmation,
} from "./depositConfirmationMessage.ts";

Deno.test("sends for a genuine part payment", () => {
  assert(shouldSendDepositConfirmation({ amountPaid: 5, balanceRemaining: 5, fullyPaid: false }));
});

Deno.test("never sends when the payment settles the job", () => {
  assertEquals(
    shouldSendDepositConfirmation({ amountPaid: 10, balanceRemaining: 0, fullyPaid: true }),
    false,
  );
});

Deno.test("never sends with no balance left to state", () => {
  assertEquals(
    shouldSendDepositConfirmation({ amountPaid: 10, balanceRemaining: 0, fullyPaid: false }),
    false,
  );
});

Deno.test("never sends for a zero or invalid amount", () => {
  assertEquals(
    shouldSendDepositConfirmation({ amountPaid: 0, balanceRemaining: 5, fullyPaid: false }),
    false,
  );
  assertEquals(
    shouldSendDepositConfirmation({ amountPaid: Number.NaN, balanceRemaining: 5, fullyPaid: false }),
    false,
  );
});

Deno.test("message states both amount paid and remaining balance", () => {
  const msg = buildDepositConfirmationMessage({
    customerName: "ZZ SCRATCH",
    jobReference: "DG-900",
    amountPaid: 5,
    balanceRemaining: 5,
    businessName: "Dublin Gas",
    footer: "Dublin Gas | 5 Main Street, Swords, Co. Dublin | 01 5433433",
  });

  assert(msg.includes("Hi ZZ SCRATCH"));
  assert(msg.includes("Job Ref: DG-900"));
  assert(msg.includes("Amount paid: €5.00 (Card)"));
  assert(msg.includes("Balance remaining: €5.00"));
  assert(msg.includes("still due"));
  assert(msg.includes("Dublin Gas | 5 Main Street"));
  // The full receipt is reserved for final settlement — no receipt link here.
  assertEquals(msg.includes("receipt here"), false);
});

Deno.test("message copes with missing name, ref and footer", () => {
  const msg = buildDepositConfirmationMessage({
    customerName: null,
    jobReference: null,
    amountPaid: 153.749,
    balanceRemaining: 100,
  });
  assert(msg.includes("Hi there"));
  assertEquals(msg.includes("Job Ref"), false);
  assert(msg.includes("Amount paid: €153.75 (Card)"));
  assert(msg.includes("Balance remaining: €100.00"));
});

Deno.test("formatEuro rounds to cents", () => {
  assertEquals(formatEuro(5), "€5.00");
  assertEquals(formatEuro(0.005), "€0.01");
});
