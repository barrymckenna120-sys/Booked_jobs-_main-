import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPaymentAlert } from "./paymentAlertMessage.ts";

Deno.test("states the outstanding balance for a deposit", () => {
  const a = buildPaymentAlert({
    amount: 150,
    fullyPaid: false,
    jobReference: "DG-443",
    customerName: "Mary Burke",
    outstanding: 350,
  });
  assertEquals(a.title, "Deposit received — DG-443");
  assertEquals(
    a.body,
    "€150.00 paid by card (SumUp) — deposit on DG-443 for Mary Burke · €350.00 still outstanding",
  );
});

Deno.test("never adds an outstanding clause to a full payment", () => {
  const a = buildPaymentAlert({
    amount: 500,
    fullyPaid: true,
    jobReference: "DG-444",
    customerName: "Mary Burke",
    outstanding: 0,
  });
  assertEquals(a.title, "Payment received — DG-444");
  assertEquals(a.body, "€500.00 paid by card (SumUp) — full payment on DG-444 for Mary Burke");
  assert(!a.body.includes("outstanding"));
});

Deno.test("omits the clause when a part payment leaves no balance recorded", () => {
  const a = buildPaymentAlert({
    amount: 80,
    fullyPaid: false,
    jobReference: "DG-445",
    outstanding: 0,
  });
  assertEquals(a.body, "€80.00 paid by card (SumUp) — deposit on DG-445");
});

Deno.test("ignores a non-finite or negative outstanding figure", () => {
  for (const outstanding of [Number.NaN, -25, null]) {
    const a = buildPaymentAlert({
      amount: 80,
      fullyPaid: false,
      jobReference: "DG-445",
      outstanding,
    });
    assert(!a.body.includes("outstanding"));
  }
});

Deno.test("drops the customer clause when the name is missing or blank", () => {
  const a = buildPaymentAlert({
    amount: 80,
    fullyPaid: false,
    jobReference: "DG-445",
    customerName: "  ",
  });
  assertEquals(a.body, "€80.00 paid by card (SumUp) — deposit on DG-445");
});

Deno.test("falls back to the short job id when there is no job reference", () => {
  const a = buildPaymentAlert({
    amount: 80,
    fullyPaid: true,
    jobReference: null,
    fallbackReference: "8cd92fb7",
  });
  assertEquals(a.title, "Payment received — 8cd92fb7");
  assert(a.body.includes("on 8cd92fb7"));
});

Deno.test("rounds to cents", () => {
  const a = buildPaymentAlert({
    amount: 150.005,
    fullyPaid: false,
    jobReference: "DG-1",
    outstanding: 349.994,
  });
  assert(a.body.includes("€150.01"));
  assert(a.body.includes("€349.99"));
});
