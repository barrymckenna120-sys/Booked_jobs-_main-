import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { last9Digits, normalisePhoneE164, samePhone } from "./phone.ts";

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
