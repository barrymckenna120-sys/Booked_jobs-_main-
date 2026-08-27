import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { last9Digits, normalisePhoneE164, phoneMatchKey, samePhone, toE164Digits } from "./phone.ts";

Deno.test("last9Digits normalises every stored/inbound variant to one key", () => {
  const expected = "871234567";
  for (const v of [
    "+353871234567",
    "353871234567",
    "0871234567",
    "00353871234567",
    "+353 87 123 4567",
    "(087) 123-4567",
  ]) {
    assertEquals(last9Digits(v), expected, `failed for ${v}`);
  }
});

Deno.test("last9Digits returns empty for unmatchable input", () => {
  assertEquals(last9Digits(""), "");
  assertEquals(last9Digits("12345"), "");
  assertEquals(last9Digits(null), "");
  assertEquals(last9Digits(undefined), "");
  assertEquals(last9Digits(12345 as unknown), "");
});

Deno.test("samePhone matches across formats but never on empty keys", () => {
  assertEquals(samePhone("+353871234567", "0871234567"), true);
  assertEquals(samePhone("+353871234567", "+353879999999"), false);
  assertEquals(samePhone("", ""), false);
  assertEquals(samePhone("1234", "1234"), false);
});

Deno.test("normalisePhoneE164 produces +353 form", () => {
  assertEquals(normalisePhoneE164("0871234567"), "+353871234567");
  assertEquals(normalisePhoneE164("353871234567"), "+353871234567");
  assertEquals(normalisePhoneE164("+353871234567"), "+353871234567");
  assertEquals(normalisePhoneE164("087 123 4567"), "+353871234567");
  assertEquals(normalisePhoneE164(""), "");
  assertEquals(normalisePhoneE164(null), "");
});

Deno.test("toE164Digits keeps international numbers (regression: STOP reply to +212 failed)", () => {
  assertEquals(toE164Digits("+212656802656"), "212656802656");
  assertEquals(toE164Digits("212656802656"), "212656802656");
  assertEquals(toE164Digits("00212656802656"), "212656802656");
  assertEquals(toE164Digits("+212 656-802 656"), "212656802656");
  assertEquals(toE164Digits("+44 7700 900123"), "447700900123");
});

Deno.test("toE164Digits still handles Irish forms", () => {
  assertEquals(toE164Digits("0871234567"), "353871234567");
  assertEquals(toE164Digits("353871234567"), "353871234567");
  assertEquals(toE164Digits("+353871234567"), "353871234567");
  assertEquals(toE164Digits("00353871234567"), "353871234567");
});

Deno.test("toE164Digits throws on unusable input", () => {
  for (const v of ["", "   ", "abc", "12345", null, undefined, "+1234567890123456"]) {
    let threw = false;
    try { toE164Digits(v as unknown); } catch { threw = true; }
    assertEquals(threw, true, `expected throw for ${String(v)}`);
  }
});

// ---------------------------------------------------------------- samePhone
//
// Regression: matching used to compare only the last 9 digits, which ignores
// the country code. Production data held BOTH `+212656802656` (test handset,
// Morocco) and `+353656802656` (an Irish customer record), so an inbound
// WhatsApp CANCEL from the Moroccan handset was indistinguishable from the
// Irish customer — and with exactly one eligible job the "never guess" guard
// would not fire, cancelling a real booking.

Deno.test("REGRESSION: +212 and +353 sharing the last 9 digits are NOT the same line", () => {
  assertEquals(samePhone("+212656802656", "+353656802656"), false);
  assertEquals(samePhone("+353656802656", "+212656802656"), false);
  // ...even though the coarse narrowing hint still collides, by design.
  assertEquals(last9Digits("+212656802656"), last9Digits("+353656802656"));
});

Deno.test("samePhone rejects other cross-country collisions", () => {
  assertEquals(samePhone("+447700900123", "+353700900123"), false);
  assertEquals(samePhone("00212656802656", "00353656802656"), false);
  assertEquals(samePhone("+212656802656", "0656802656"), false);
});

Deno.test("samePhone still matches every Irish stored format (no regression)", () => {
  const forms = [
    "+353871234567",
    "353871234567",
    "0871234567",
    "00353871234567",
    "+353 87 123 4567",
    "087 123 4567",
    "(087) 123-4567",
    "871234567", // bare local fragment, assumed Irish
  ];
  for (const a of forms) {
    for (const b of forms) {
      assertEquals(samePhone(a, b), true, `expected ${a} === ${b}`);
    }
  }
});

Deno.test("samePhone matches international numbers to themselves across formats", () => {
  assertEquals(samePhone("+212656802656", "212656802656"), true);
  assertEquals(samePhone("+212656802656", "00212656802656"), true);
  assertEquals(samePhone("+212 656-802 656", "212656802656"), true);
});

Deno.test("samePhone never matches unusable input, including two blanks", () => {
  for (const v of ["", "   ", "abc", "12345", null, undefined]) {
    assertEquals(samePhone(v as unknown, "+353871234567"), false);
    assertEquals(samePhone(v as unknown, v as unknown), false, `two blanks matched: ${String(v)}`);
  }
});

Deno.test("phoneMatchKey is full E.164 digits and resolves bare Irish fragments", () => {
  assertEquals(phoneMatchKey("+353871234567"), "353871234567");
  assertEquals(phoneMatchKey("0871234567"), "353871234567");
  assertEquals(phoneMatchKey("871234567"), "353871234567");
  assertEquals(phoneMatchKey("+212656802656"), "212656802656");
  assertEquals(phoneMatchKey("junk"), "");
});
