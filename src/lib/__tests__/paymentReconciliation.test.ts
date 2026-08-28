import { describe, it, expect } from "vitest";
import {
  exceptionReasons,
  isReconciliationException,
  type ReconciliationCandidate,
} from "../paymentReconciliation";

const base: ReconciliationCandidate = {
  revenue: 200,
  balance_due: 0,
  payment_status: "paid",
  payment_method: "card",
  ledger_total: 200,
  payment_count: 2,
};

describe("payment reconciliation detection", () => {
  it("does not flag a €100 deposit + €100 balance on a €200 job that settled correctly", () => {
    expect(isReconciliationException(base)).toBe(false);
    expect(exceptionReasons(base)).toEqual([]);
  });

  it("flags the same job when it was left as partial", () => {
    const stranded: ReconciliationCandidate = {
      ...base,
      payment_status: "partial",
      balance_due: 100,
    };
    expect(isReconciliationException(stranded)).toBe(true);
    expect(exceptionReasons(stranded)).toContain("unpaid_but_covered");
    expect(exceptionReasons(stranded)).toContain("stale_balance");
  });

  it("flags a job marked paid whose ledger does not cover the price", () => {
    expect(
      exceptionReasons({ ...base, revenue: 1000, ledger_total: 500, payment_count: 1 }),
    ).toEqual(["stale_balance"]);
  });

  it("ignores invoice settlements", () => {
    expect(
      isReconciliationException({
        ...base,
        payment_method: "invoice",
        payment_status: "partial",
        balance_due: 200,
      }),
    ).toBe(false);
  });

  it("ignores jobs with no payments recorded", () => {
    expect(
      isReconciliationException({ ...base, ledger_total: 0, payment_count: 0, balance_due: 200, payment_status: "unpaid" }),
    ).toBe(false);
  });

  it("ignores jobs with no revenue set", () => {
    expect(isReconciliationException({ ...base, revenue: null, payment_status: "partial" })).toBe(false);
  });

  it("tolerates one cent of rounding noise", () => {
    expect(isReconciliationException({ ...base, ledger_total: 199.995 })).toBe(false);
    expect(isReconciliationException({ ...base, ledger_total: 199.5 })).toBe(true);
  });

  it("does not flag a partially paid job whose balance matches the ledger", () => {
    expect(
      isReconciliationException({
        ...base,
        payment_status: "partial",
        balance_due: 100,
        ledger_total: 100,
        payment_count: 1,
      }),
    ).toBe(false);
  });
});
