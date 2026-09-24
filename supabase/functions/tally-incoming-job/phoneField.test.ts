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

import { isValidIntakePhone, normaliseIntakePhone } from "./phoneField.ts";

Deno.test("accepts genuine international and Irish numbers", () => {
  const cases: Record<string, string> = {
    "+212656802656": "+212656802656",
    "00212656802656": "+212656802656",
    "+44 7911 123456": "+447911123456",
    "087 235 4257": "+353872354257",
    "+353872354257": "+353872354257",
    "353872354257": "+353872354257",
  };
  for (const [raw, want] of Object.entries(cases)) {
    assertEquals(isValidIntakePhone(raw), true, raw);
    assertEquals(normaliseIntakePhone(raw), want, raw);
  }
});

Deno.test("rejects implausible numbers", () => {
  for (const raw of ["+212123", "+999123456789", "12345", "abc", "+3538723542571234567"]) {
    assertEquals(isValidIntakePhone(raw), false, raw);
  }
});

Deno.test("Irish formats keep today's stored value", () => {
  for (const raw of ["0872354257", "+353 87 235 4257", "(087) 235-4257", "353872354257"]) {
    assertEquals(normaliseIntakePhone(raw), normalisePhoneE164(raw), raw);
  }
});
