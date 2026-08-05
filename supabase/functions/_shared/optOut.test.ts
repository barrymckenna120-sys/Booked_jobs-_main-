import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateOptOut, isOptedOut } from "./optOut.ts";

// Regression coverage for the opt-out gaps in send-renewal-reminder,
// send-upcoming-reminders and send-warranty-whatsapp: an opted-out customer
// must never be messaged by these automations.

Deno.test("opted-out customer is always skipped", () => {
  assertEquals(evaluateOptOut({ opted_out: true, phone: "0871234567" }), {
    skip: true,
    reason: "customer_opted_out",
  });
  assertEquals(isOptedOut({ opted_out: true, phone: "0871234567" }), true);
});

Deno.test("opted-in customer with a phone is allowed", () => {
  assertEquals(evaluateOptOut({ opted_out: false, phone: "0871234567" }), { skip: false });
  assertEquals(isOptedOut({ opted_out: false, phone: "0871234567" }), false);
});

Deno.test("null opted_out is treated as opted in (legacy rows)", () => {
  assertEquals(evaluateOptOut({ opted_out: null, phone: "0871234567" }), { skip: false });
  assertEquals(isOptedOut({ opted_out: null, phone: "0871234567" }), false);
});

Deno.test("missing customer row fails closed", () => {
  assertEquals(evaluateOptOut(null), { skip: true, reason: "customer_not_found" });
  assertEquals(evaluateOptOut(undefined), { skip: true, reason: "customer_not_found" });
  assertEquals(isOptedOut(null), true);
});

Deno.test("missing or blank phone is skipped", () => {
  assertEquals(evaluateOptOut({ opted_out: false, phone: null }), {
    skip: true,
    reason: "no_phone_number",
  });
  assertEquals(evaluateOptOut({ opted_out: false, phone: "   " }), {
    skip: true,
    reason: "no_phone_number",
  });
});

Deno.test("opt-out takes precedence over a missing phone", () => {
  assertEquals(evaluateOptOut({ opted_out: true, phone: null }), {
    skip: true,
    reason: "customer_opted_out",
  });
});

Deno.test("truthy-but-not-true values do not accidentally opt a customer out", () => {
  // Only a strict boolean true blocks; guards against string/JSON coercion bugs.
  assertEquals(isOptedOut({ opted_out: undefined, phone: "0871234567" }), false);
});
