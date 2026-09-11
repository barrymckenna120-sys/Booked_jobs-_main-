import { describe, expect, it } from "vitest";
import { matchesSalesLedgerSearch, type SalesLedgerSearchRow } from "./salesLedgerSearch";

const dg1019: SalesLedgerSearchRow = {
  customer_name: "John Murphy",
  job_reference: "DG-1019",
  receipt_number: "DG-2026-2899",
  invoice_number: "INV-1042",
};

describe("matchesSalesLedgerSearch", () => {
  it.each([
    "DG-1019",
    "dg-1019",
    "  DG-2026-2899  ",
    "john",
    "MURPHY",
    "inv-1042",
  ])("matches Finance identifiers using %s", (search) => {
    expect(matchesSalesLedgerSearch(dg1019, search)).toBe(true);
  });

  it("returns all rows for a blank search", () => {
    expect(matchesSalesLedgerSearch(dg1019, "   ")).toBe(true);
  });

  it("rejects a search that matches no identifier", () => {
    expect(matchesSalesLedgerSearch(dg1019, "KN-9999")).toBe(false);
  });
});