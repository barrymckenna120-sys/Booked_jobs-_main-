import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bookingConfirmationSkip } from "./bookingConfirmationSkip.ts";

Deno.test("opted-out customer is skipped with the opted_out reason", () => {
  assertEquals(bookingConfirmationSkip({ opted_out: true, phone: "353871234567" }), {
    skip: true,
    reason: "opted_out",
    message: "Customer opted out of messages",
  });
});

Deno.test("missing phone is skipped with the no_phone reason", () => {
  assertEquals(bookingConfirmationSkip({ opted_out: false, phone: null }), {
    skip: true,
    reason: "no_phone",
    message: "Customer has no phone number",
  });
  assertEquals(bookingConfirmationSkip({ opted_out: false, phone: "  " }).reason, "no_phone");
});

Deno.test("missing customer row fails closed", () => {
  assertEquals(bookingConfirmationSkip(null).reason, "customer_not_found");
});

Deno.test("opt-out wins over a missing phone", () => {
  assertEquals(bookingConfirmationSkip({ opted_out: true, phone: null }).reason, "opted_out");
});

Deno.test("opted-in customer with a phone is not skipped", () => {
  assertEquals(bookingConfirmationSkip({ opted_out: false, phone: "353871234567" }), { skip: false });
  assertEquals(bookingConfirmationSkip({ opted_out: null, phone: "353871234567" }), { skip: false });
});
