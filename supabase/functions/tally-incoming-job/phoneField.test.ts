import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PHONE_FIELD_KEYS, pickPhoneField } from "./phoneField.ts";
import { normalisePhoneE164 } from "../_shared/phone.ts";

Deno.test("every alias resolves", () => {
  for (const key of PHONE_FIELD_KEYS) {
    assertEquals(pickPhoneField({ [key]: "0871234567" }, 100), "0871234567");
  }
});

Deno.test("mobile_number wins when several are present", () => {
  assertEquals(pickPhoneField({ phone: "0870000000", mobile_number: "0871111111" }, 100), "0871111111");
});

Deno.test("alias with a non-phone value is ignored", () => {
  assertEquals(pickPhoneField({ phone: "WhatsApp", mobile_no: "0871234567" }, 100), "0871234567");
  assertEquals(pickPhoneField({ contact_number: "email please" }, 100), null);
});

Deno.test("malformed mobile_number still reaches existing validation", () => {
  assertEquals(pickPhoneField({ mobile_number: "abc" }, 100), "abc");
});

Deno.test("missing phone returns null", () => {
  assertEquals(pickPhoneField({ customer_name: "x" }, 100), null);
});

Deno.test("spaced number normalises to clean E.164", () => {
  const v = pickPhoneField({ moblie_no: "+353 87 235 4257" }, 100)!;
  assertEquals(normalisePhoneE164(v), "+353872354257");
});
