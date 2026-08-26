import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatReceiptAmount, resolveReceiptAmount } from "./receiptAmount.ts";

Deno.test("deposit receipt amount uses the actual charged amount before the job total", () => {
  const amount = resolveReceiptAmount({ paymentAmount: 5, revenue: 20 });

  assertEquals(amount, 5);
  assertEquals(formatReceiptAmount(amount), "€5.00");
});

Deno.test("latest ledger payment is used before revenue when no explicit amount is provided", () => {
  const amount = resolveReceiptAmount({ ledgerAmount: "5.00", revenue: 20 });

  assertEquals(amount, 5);
});

Deno.test("job total remains the fallback for legacy receipts without payment rows", () => {
  const amount = resolveReceiptAmount({ revenue: 20 });

  assertEquals(amount, 20);
  assertEquals(formatReceiptAmount(amount), "€20.00");
});