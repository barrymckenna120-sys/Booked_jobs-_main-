import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliseMediaUrls } from "./mediaUrls.ts";

const A = "https://storage.tally.so/a.jpg";
const B = "https://storage.tally.so/b.mov";

Deno.test("1. single URL string", () => {
  assertEquals(normaliseMediaUrls(A), [A]);
});

Deno.test("2. URL containing a comma is not split", () => {
  // Comma-separated strings are intentionally unsupported: a valid URL may contain a comma.
  assertEquals(normaliseMediaUrls("https://example.com?a=1,b=2"), ["https://example.com?a=1,b=2"]);
});

Deno.test("3. JSON array encoded as a string", () => {
  assertEquals(normaliseMediaUrls(JSON.stringify([A, B])), [A, B]);
});

Deno.test("4. proper JSON array of strings", () => {
  assertEquals(normaliseMediaUrls([A, B]), [A, B]);
});

Deno.test("5. Tally array of objects", () => {
  assertEquals(
    normaliseMediaUrls([
      { id: "1", name: "a.jpg", mimeType: "image/jpeg", size: 10, url: A },
      { id: "2", name: "b.mov", mimeType: "video/quicktime", size: 20, url: B },
    ]),
    [A, B],
  );
  assertEquals(normaliseMediaUrls({ url: A }), [A]);
});

Deno.test("removes duplicates, preserves order", () => {
  assertEquals(normaliseMediaUrls([A, B, A, `${B}`]), [A, B]);
  assertEquals(normaliseMediaUrls([A, A]), [A]);
});

Deno.test("ignores empty and invalid values", () => {
  assertEquals(normaliseMediaUrls(null), []);
  assertEquals(normaliseMediaUrls(undefined), []);
  assertEquals(normaliseMediaUrls(""), []);
  assertEquals(normaliseMediaUrls("   "), []);
  assertEquals(normaliseMediaUrls([]), []);
  assertEquals(normaliseMediaUrls("not-a-url"), []);
  assertEquals(normaliseMediaUrls(["not-a-url", A, ""]), [A]);
  assertEquals(normaliseMediaUrls([{ name: "no-url.jpg" }]), []);
  assertEquals(normaliseMediaUrls(42), []);
});

Deno.test("malformed JSON string is treated as a single URL", () => {
  // Starts with `[` but is not valid JSON; no delimiter fallback, so it is dropped.
  assertEquals(normaliseMediaUrls(`["${A}", "${B}"`), []);
});
