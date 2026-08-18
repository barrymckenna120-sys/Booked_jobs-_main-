import { describe, it, expect } from "vitest";
import { buildBoilerCustomerUpdate } from "../boilerCustomerDiff";
import { sanitizeServiceCallUpdatePayload } from "../serviceCallUpdate";

describe("buildBoilerCustomerUpdate", () => {
  const baseline = {
    boiler_brand: "Ideal",
    boiler_model: "Logic Max",
    warranty_expiry_date: "2028-08-18",
  };

  it("omits unchanged values", () => {
    expect(
      buildBoilerCustomerUpdate(
        { boilerMake: "Ideal", boilerModel: "Logic Max", warrantyExpiry: "2028-08-18" },
        baseline
      )
    ).toEqual({});
  });

  it("includes edited values, trimmed", () => {
    expect(
      buildBoilerCustomerUpdate({ boilerMake: "  Vaillant  " }, baseline)
    ).toEqual({ boiler_brand: "Vaillant" });
  });

  it("writes null when a pre-filled value is cleared", () => {
    expect(buildBoilerCustomerUpdate({ warrantyExpiry: "" }, baseline)).toEqual({
      warranty_expiry_date: null,
    });
  });

  it("omits keys that were never collected (undefined)", () => {
    expect(buildBoilerCustomerUpdate({}, baseline)).toEqual({});
  });

  it("treats a customer with no boiler data on file as an empty baseline", () => {
    expect(buildBoilerCustomerUpdate({ boilerModel: "C30" }, null)).toEqual({
      boiler_model: "C30",
    });
    expect(buildBoilerCustomerUpdate({ boilerModel: "" }, null)).toEqual({});
  });
});

describe("card completion path payload (regression)", () => {
  it("keeps customer_facing_notes while stripping the UI-only note key", () => {
    // Mirrors what useEngineerJobs.updateJob builds for a card completion.
    const dbPatch = {
      status: "Completed",
      customerNotes: "Boiler serviced and left in good working order.",
      customer_facing_notes: "Boiler serviced and left in good working order.",
      boilerMake: "Vaillant",
    };
    const safe = sanitizeServiceCallUpdatePayload(dbPatch);
    expect(safe.customer_facing_notes).toBe("Boiler serviced and left in good working order.");
    expect("customerNotes" in safe).toBe(false);
    expect("boilerMake" in safe).toBe(false);
  });
});
