import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildPartialPaymentRecordPath } from "./partialPaymentRecord.ts";

Deno.test("part-payment record path is available after PDF generation", () => {
  assertEquals(
    buildPartialPaymentRecordPath({ accessToken: "abc-123", pdfReady: true }),
    "/receipt/abc-123",
  );
});

Deno.test("part-payment record path is omitted when PDF generation fails", () => {
  assertEquals(
    buildPartialPaymentRecordPath({ accessToken: "abc-123", pdfReady: false }),
    null,
  );
});

Deno.test("part-payment record path is omitted without an access token", () => {
  assertEquals(buildPartialPaymentRecordPath({ accessToken: null, pdfReady: true }), null);
  assertEquals(buildPartialPaymentRecordPath({ accessToken: "  ", pdfReady: true }), null);
});