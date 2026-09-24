import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rebookMobileParam } from "./rebookPhone.ts";

Deno.test("international kept", () => assertEquals(rebookMobileParam("+212656802656", "353"), "+212656802656"));
Deno.test("Irish local", () => assertEquals(rebookMobileParam("0871234567", "353"), "+353871234567"));
Deno.test("Irish without plus", () => assertEquals(rebookMobileParam("353871234567", "353"), "+353871234567"));
Deno.test("Irish E.164", () => assertEquals(rebookMobileParam("+353871234567", "353"), "+353871234567"));
Deno.test("00 prefix", () => assertEquals(rebookMobileParam("00447911123456", "353"), "+447911123456"));
Deno.test("bare 9 digits", () => assertEquals(rebookMobileParam("871234567", "353"), "+353871234567"));
Deno.test("empty", () => assertEquals(rebookMobileParam("", "353"), ""));
Deno.test("null", () => assertEquals(rebookMobileParam(null, "353"), ""));
Deno.test("junk", () => assertEquals(rebookMobileParam("abc12", "353"), ""));
Deno.test("encoded in URL", () =>
  assertEquals(`&Mobile=${encodeURIComponent(rebookMobileParam("+212656802656", "353"))}`, "&Mobile=%2B212656802656"));
