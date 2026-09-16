import { describe, expect, it } from "vitest";
import {
  EXPORT_COLUMNS,
  buildExportRows,
  deriveWarrantyExpiry,
  deriveWarrantyStatus,
  formatBooleanForExport,
  formatRenewalStageForExport,
} from "../customerExportFormat";
import { filterCustomers, matchesSearch, resolveSelectedCustomers } from "../../pages/ExportCustomers";

const customer = (over: Partial<any> = {}) => ({
  id: over.id || "c1",
  name: "Mary Byrne",
  phone: "0862334444",
  address: "12 Main Street, Dublin",
  eircode: "D24W289",
  area_code: "D24W",
  gprn: "1234567890",
  service_status: "active",
  renewal_stage: "not_contacted",
  next_service_due: "2027-03-01",
  boiler_installation_date: "2024-01-15",
  warranty_years: 5,
  ...over,
});

describe("selection", () => {
  it("keeps a selection through a search change", () => {
    const list = [customer({ id: "a" }), customer({ id: "b", name: "John Kelly" })];
    const selected = new Set(["a", "b"]);
    expect(filterCustomers(list, { search: "john", status: "all", stage: "all", area: "all" })).toHaveLength(1);
    expect(resolveSelectedCustomers(list, selected)).toHaveLength(2);
  });

  it("keeps a selection through a filter change and after clearing it", () => {
    const list = [
      customer({ id: "a", service_status: "Overdue" }),
      customer({ id: "b", service_status: "active" }),
    ];
    const selected = new Set(["a", "b"]);
    expect(filterCustomers(list, { search: "", status: "Overdue", stage: "all", area: "all" })).toHaveLength(1);
    expect(resolveSelectedCustomers(list, selected)).toHaveLength(2);
    expect(filterCustomers(list, { search: "", status: "all", stage: "all", area: "all" })).toHaveLength(2);
  });

  it("ignores ids that are not in the organisation-scoped set", () => {
    const list = [customer({ id: "a" })];
    expect(resolveSelectedCustomers(list, new Set(["a", "someone-elses-customer"]))).toHaveLength(1);
  });

  it("zero selected produces no rows to export", () => {
    expect(buildExportRows(resolveSelectedCustomers([customer()], new Set()))).toHaveLength(0);
  });

  it("searches name, mobile, address, Eircode and GPRN", () => {
    const c = customer();
    expect(matchesSearch(c, "mary")).toBe(true);
    expect(matchesSearch(c, "862334")).toBe(true);
    expect(matchesSearch(c, "main street")).toBe(true);
    expect(matchesSearch(c, "d24w289")).toBe(true);
    expect(matchesSearch(c, "1234567890")).toBe(true);
    expect(matchesSearch(c, "nothing here")).toBe(false);
  });

  it("filters by renewal stage and area code using existing values", () => {
    const list = [customer({ id: "a", renewal_stage: "reminded", area_code: "D24W" }), customer({ id: "b" })];
    expect(filterCustomers(list, { search: "", status: "all", stage: "reminded", area: "all" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterCustomers(list, { search: "", status: "all", stage: "all", area: "D24" })).toHaveLength(2);
  });

  it("stays responsive with 5,000 customers", () => {
    const list = Array.from({ length: 5000 }, (_, i) => customer({ id: `c${i}`, name: `Customer ${i}` }));
    const started = performance.now();
    const filtered = filterCustomers(list, { search: "customer 4", status: "all", stage: "all", area: "all" });
    const selected = resolveSelectedCustomers(list, new Set(list.map((c) => c.id)));
    expect(filtered.length).toBeGreaterThan(0);
    expect(selected).toHaveLength(5000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("row builder", () => {
  it("builds one row per selected customer with every column present", () => {
    const rows = buildExportRows([customer({ id: "a" }), customer({ id: "b" })]);
    expect(rows).toHaveLength(2);
    EXPORT_COLUMNS.forEach((col) => expect(rows[0]).toHaveProperty(col));
  });

  it("applies the agreed formatting", () => {
    const [row] = buildExportRows([customer()]);
    expect(row["Mobile Number"]).toBe("+353862334444");
    expect(row["Eircode"]).toBe("D24 W289");
    expect(row["Area Code"]).toBe("D24");
    expect(row["Service Status"]).toBe("Up to Date");
    expect(row["Next Service Due"]).toBe("2027-03-01");
    expect(row["Renewal Stage"]).toBe("Not Contacted");
  });

  it("exports communication preferences as Yes / No / blank", () => {
    const [row] = buildExportRows([customer({ opted_out: true, whatsapp_opt_in: false })]);
    expect(row["Opted Out of Reminders"]).toBe("Yes");
    expect(row["WhatsApp Opt-In"]).toBe("No");
    expect(row["Reminders Consent"]).toBe("");
    expect(formatBooleanForExport(null)).toBe("");
  });

  it("keeps boiler brand and model separate", () => {
    const [row] = buildExportRows([customer({ boiler_brand: "Ideal", boiler_model: "Logic 30", boiler_make_model: null })]);
    expect(row["Boiler Brand"]).toBe("Ideal");
    expect(row["Boiler Model"]).toBe("Logic 30");
    expect(row["Boiler Make / Model"]).toBe("Ideal Logic 30");
  });

  it("renewal stage labels match the profile dropdown", () => {
    expect(formatRenewalStageForExport("booked")).toBe("Booked In");
    expect(formatRenewalStageForExport(null)).toBe("");
  });
});

describe("warranty derivation", () => {
  it("derives expiry from installation date plus warranty years", () => {
    expect(deriveWarrantyExpiry("2024-01-15", 5)).toBe("2029-01-15");
  });
  it("falls back to the stored expiry when nothing can be derived", () => {
    expect(deriveWarrantyExpiry(null, null, "2030-06-01")).toBe("2030-06-01");
    expect(deriveWarrantyExpiry(null, null)).toBe("");
  });
  it("uses the existing status rule", () => {
    const today = new Date("2026-09-16T12:00:00");
    expect(deriveWarrantyStatus("2025-01-01", today)).toBe("Expired");
    expect(deriveWarrantyStatus("2026-10-01", today)).toBe("Expiring Soon");
    expect(deriveWarrantyStatus("2029-01-15", today)).toBe("Under Warranty");
    expect(deriveWarrantyStatus("", today)).toBe("");
  });
});
