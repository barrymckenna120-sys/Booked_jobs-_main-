import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rebookMobileParam } from "./rebookPhone.ts";

Deno.test("international kept", () => assertEquals(rebookMobileParam("+212656802656"), "+212656802656"));
Deno.test("Irish local kept", () => assertEquals(rebookMobileParam("0871234567"), "0871234567"));
Deno.test("Irish without plus kept", () => assertEquals(rebookMobileParam("353871234567"), "353871234567"));
Deno.test("Irish E.164 kept", () => assertEquals(rebookMobileParam("+353871234567"), "+353871234567"));
Deno.test("00 prefix kept", () => assertEquals(rebookMobileParam("00447911123456"), "00447911123456"));
Deno.test("bare 9 digits kept", () => assertEquals(rebookMobileParam("871234567"), "871234567"));
Deno.test("spacing and punctuation kept", () => assertEquals(rebookMobileParam(" 087 123-4567 "), " 087 123-4567 "));
Deno.test("empty", () => assertEquals(rebookMobileParam(""), ""));
Deno.test("null", () => assertEquals(rebookMobileParam(null), ""));
Deno.test("non-phone text is not changed", () => assertEquals(rebookMobileParam("abc12"), "abc12"));
Deno.test("encoded in URL", () =>
  assertEquals(`&Mobile=${encodeURIComponent(rebookMobileParam("+212656802656"))}`, "&Mobile=%2B212656802656"));
