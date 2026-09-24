import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAllowedTarget } from "./targetRule.ts";

const bases = ["https://book.kngasservices.ie/", "https://rebook.kngasservices.ie/"];

Deno.test("new-booking link accepted", () => {
  assert(isAllowedTarget("https://book.kngasservices.ie/?Customer=a", bases));
});
Deno.test("rebooking link accepted", () => {
  assert(isAllowedTarget("https://rebook.kngasservices.ie/?Customer=a&Mobile=1", bases));
});
Deno.test("another company's form rejected", () => {
  assertFalse(isAllowedTarget("https://tally.so/r/J9vRzR?Customer=a", bases));
});
Deno.test("lookalike address rejected", () => {
  assertFalse(isAllowedTarget("https://rebook.kngasservices.ie.evil.com/?x=1", bases));
});
Deno.test("missing/empty bases never match", () => {
  assertFalse(isAllowedTarget("https://x.ie/", [null, undefined, ""]));
});
