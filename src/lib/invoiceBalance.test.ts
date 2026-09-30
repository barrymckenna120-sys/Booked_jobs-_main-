import { describe, expect, it } from "vitest";
import { hasInvoiceablePrice, invoiceBalanceDue, jobInvoiceBalance, paymentsReceived } from "../../supabase/functions/_shared/invoiceBalance";

const bal = (total: number, job: any, ledger: any[] = []) => invoiceBalanceDue(total, paymentsReceived(job, ledger));

describe("invoice balance", () => {
  it("unpaid, no deposit: full amount owed", () => expect(bal(130, {})).toBe(130));
  it("deposit required but not paid is not subtracted", () =>
    expect(bal(369, { deposit_paid: false, deposit_amount: 184.5 })).toBe(369));
  it("deposit marked paid (no ledger entry) is subtracted", () =>
    expect(bal(369, { deposit_paid: true, deposit_amount: 184.5 })).toBe(184.5));
  it("deposit in ledger is not double counted", () =>
    expect(bal(369, { deposit_paid: true, deposit_amount: 184.5 }, [{ amount: 184.5, payment_type: "deposit" }])).toBe(184.5));
  it("deposit paid plus one later part-payment", () =>
    expect(bal(500, { deposit_paid: true, deposit_amount: 100 }, [
      { amount: 100, payment_type: "deposit" },
      { amount: 150, payment_type: "balance" },
    ])).toBe(250));
  it("fully paid shows 0", () => expect(bal(160, {}, [{ amount: 160, payment_type: "full" }])).toBe(0));
  it("overpaid never goes below 0", () => expect(bal(100, {}, [{ amount: 120, payment_type: "full" }])).toBe(0));
  it("reversal adds the amount back", () =>
    expect(bal(100, {}, [{ amount: 100, payment_type: "full" }, { amount: 100, reverses_payment_id: "x" }])).toBe(100));
  it("legacy paid job with no ledger stays fully paid", () =>
    expect(jobInvoiceBalance(130, { payment_status: "paid" }, [])).toBe(0));
  it("paid status with ledger uses the ledger", () =>
    expect(jobInvoiceBalance(300, { payment_status: "paid" }, [{ amount: 100, payment_type: "deposit" }])).toBe(200));
  it("no price and no quote cannot be invoiced", () => {
    expect(hasInvoiceablePrice(null, false)).toBe(false);
    expect(hasInvoiceablePrice(0, false)).toBe(false);
    expect(hasInvoiceablePrice(120, false)).toBe(true);
    expect(hasInvoiceablePrice(null, true)).toBe(true);
  });
});
