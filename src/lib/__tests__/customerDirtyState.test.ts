import { describe, it, expect } from "vitest";
import { buildCustomerUpdatePayload } from "../customerUpdatePayload";

/**
 * Regression: the Customer Profile showed a stuck "Unsaved Changes" warning
 * after a successful save. Cause — `originalForm` was reset from the local form
 * (raw user input) while the database stored normalised values, so the very
 * next dirty check found differences again. The page now re-seeds BOTH form and
 * originalForm from the row returned by the update.
 */
describe("customer profile dirty state after save", () => {
  const persisted = {
    id: "6f5544df",
    name: "Paula White",
    phone: "+353894436301",
    eircode: "D24 123D",
    area_code: "D24",
    warranty_years: 7,
    boiler_location: "Kitchen",
    assigned_engineer: null,
  };

  it("is clean when the form is seeded from the persisted row", () => {
    expect(buildCustomerUpdatePayload({ ...persisted }, persisted)).toEqual({});
  });

  it("would have stayed dirty if seeded from un-normalised local input", () => {
    const localInput = { ...persisted, phone: "0894436301", eircode: "d24123d" };
    // Documents the old bug: local input differs from what the database stored.
    expect(Object.keys(buildCustomerUpdatePayload(localInput, persisted)).length).toBeGreaterThan(0);
  });

  it("detects a toggle change and nothing else", () => {
    expect(buildCustomerUpdatePayload({ ...persisted, opted_out: true }, { ...persisted, opted_out: false }))
      .toEqual({ opted_out: true });
  });

  it("detects an engineer assignment", () => {
    expect(buildCustomerUpdatePayload({ ...persisted, assigned_engineer: "Paul" }, persisted))
      .toEqual({ assigned_engineer: "Paul" });
  });

  it("does not flag a warranty_years value that only changed type-safely", () => {
    expect(buildCustomerUpdatePayload({ ...persisted, warranty_years: 7 }, persisted)).toEqual({});
  });
});
