import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseReceiptStreamRequest, receiptPdfFilename } from "../_shared/receiptStream.ts";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "22222222-2222-4222-8222-222222222222";

Deno.test("accepts only the authenticated job and token pair", () => {
  assertEquals(parseReceiptStreamRequest({ job_id: JOB_ID, token: TOKEN }), {
    kind: "authenticated",
    jobId: JOB_ID,
    token: TOKEN,
  });
  assertEquals(parseReceiptStreamRequest({ job_id: JOB_ID, token: "bad" }), null);
});

Deno.test("accepts a public receipt number without mixed identifiers", () => {
  assertEquals(parseReceiptStreamRequest({ receipt_number: " DG-2026-9817 " }), {
    kind: "public",
    receiptNumber: "DG-2026-9817",
  });
  assertEquals(parseReceiptStreamRequest({ receipt_number: "DG-1", job_id: JOB_ID }), null);
});

Deno.test("sanitizes the response filename", () => {
  assertEquals(receiptPdfFilename('DG-2026-9817"\r\nX-Test: bad'), "receipt-DG-2026-9817X-Testbad.pdf");
});