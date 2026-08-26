import { describe, expect, it } from "vitest";
import { buildPaymentAlert } from "./paymentAlertMessage.ts";

describe("buildPaymentAlert", () => {
  it("states the outstanding balance for a deposit", () => {
    const a = buildPaymentAlert({
      amount: 150,
      fullyPaid: false,
      jobReference: "DG-443",
      customerName: "Mary Burke",
      outstanding: 350,
    });
    expect(a.title).toBe("Deposit received — DG-443");
    expect(a.body).toBe(
      "€150.00 paid by card (SumUp) — deposit on DG-443 for Mary Burke · €350.00 still outstanding",
    );
  });

  it("never adds an outstanding clause to a full payment", () => {
    const a = buildPaymentAlert({
      amount: 500,
      fullyPaid: true,
      jobReference: "DG-444",
      customerName: "Mary Burke",
      outstanding: 0,
    });
    expect(a.title).toBe("Payment received — DG-444");
    expect(a.body).toBe("€500.00 paid by card (SumUp) — full payment on DG-444 for Mary Burke");
    expect(a.body).not.toContain("outstanding");
  });

  it("omits the clause when a part payment leaves no balance recorded", () => {
    const a = buildPaymentAlert({ amount: 80, fullyPaid: false, jobReference: "DG-445", outstanding: 0 });
    expect(a.body).toBe("€80.00 paid by card (SumUp) — deposit on DG-445");
  });

  it("ignores a non-finite or negative outstanding figure", () => {
    for (const outstanding of [Number.NaN, -25, null]) {
      const a = buildPaymentAlert({ amount: 80, fullyPaid: false, jobReference: "DG-445", outstanding });
      expect(a.body).not.toContain("outstanding");
    }
  });

  it("drops the customer clause when the name is missing or blank", () => {
    const a = buildPaymentAlert({ amount: 80, fullyPaid: false, jobReference: "DG-445", customerName: "  " });
    expect(a.body).toBe("€80.00 paid by card (SumUp) — deposit on DG-445");
  });

  it("falls back to the short job id when there is no job reference", () => {
    const a = buildPaymentAlert({
      amount: 80,
      fullyPaid: true,
      jobReference: null,
      fallbackReference: "8cd92fb7",
    });
    expect(a.title).toBe("Payment received — 8cd92fb7");
    expect(a.body).toContain("on 8cd92fb7");
  });

  it("rounds to cents", () => {
    const a = buildPaymentAlert({ amount: 150.005, fullyPaid: false, jobReference: "DG-1", outstanding: 349.994 });
    expect(a.body).toContain("€150.01");
    expect(a.body).toContain("€349.99");
  });
});
