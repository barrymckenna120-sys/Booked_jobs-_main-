import { assertEquals } from "jsr:@std/assert";
import { cleanSubmittedPhone } from "./index.ts";

Deno.test("keeps an international number exactly as submitted", () => {
  assertEquals(cleanSubmittedPhone("+212656802656"), "+212656802656");
});

Deno.test("keeps a 00-prefixed international number without rewriting", () => {
  assertEquals(cleanSubmittedPhone("00212656802656"), "00212656802656");
});

Deno.test("keeps an Irish E.164 number as-is", () => {
  assertEquals(cleanSubmittedPhone("+353872354257"), "+353872354257");
});

Deno.test("keeps an Irish local number as-is (no +353 added)", () => {
  assertEquals(cleanSubmittedPhone("0872354257"), "0872354257");
});

Deno.test("does NOT convert a leading-zero number to +353", () => {
  // The old behaviour turned this into +353656802656; it must now pass through.
  assertEquals(cleanSubmittedPhone("0656802656"), "0656802656");
});

Deno.test("strips spaces, dashes and brackets but keeps the digits", () => {
  assertEquals(cleanSubmittedPhone("+353 87 235 4257"), "+353872354257");
  assertEquals(cleanSubmittedPhone("(087) 235-4257"), "0872354257");
});

Deno.test("rejects empty, missing and non-phone values", () => {
  assertEquals(cleanSubmittedPhone(""), "");
  assertEquals(cleanSubmittedPhone(undefined), "");
  assertEquals(cleanSubmittedPhone(null), "");
  assertEquals(cleanSubmittedPhone(12345), "");
  assertEquals(cleanSubmittedPhone("not-a-phone"), "");
  assertEquals(cleanSubmittedPhone("123"), ""); // too short
  assertEquals(cleanSubmittedPhone("+12345678901234567890"), ""); // too long
});
