import { describe, it, expect } from "vitest";
import { deriveJobStatusFromParts, buildPartsRequestRow, priorityRank } from "./partsStatus";

describe("deriveJobStatusFromParts", () => {
  it("flags Parts Needed when the job has an Open part", () => {
    expect(deriveJobStatusFromParts("Scheduled", ["Open", "Ordered"])).toBe("parts_needed");
    expect(deriveJobStatusFromParts("Booked", ["Open"])).toBe("parts_needed");
    expect(deriveJobStatusFromParts("Pending", ["Open"])).toBe("parts_needed");
  });

  it("falls back to Parts Ordered when nothing is Open", () => {
    expect(deriveJobStatusFromParts("Scheduled", ["Ordered", "Ready to Fit"])).toBe("parts_ordered");
  });

  it("uses Parts Arrived when everything is Ready to Fit", () => {
    expect(deriveJobStatusFromParts("Booked", ["Ready to Fit"])).toBe("parts_arrived");
  });

  it("ignores Cancelled parts", () => {
    expect(deriveJobStatusFromParts("Scheduled", ["Cancelled"])).toBe(null);
    expect(deriveJobStatusFromParts("parts_needed", ["Cancelled"], true)).toBe("Booked");
  });

  it("returns a closed-out parts job to Booked when dated, Pending when not", () => {
    expect(deriveJobStatusFromParts("parts_ordered", [], true)).toBe("Booked");
    expect(deriveJobStatusFromParts("parts_ordered", [], false)).toBe("Pending");
    expect(deriveJobStatusFromParts("parts_arrived", ["Cancelled"], false)).toBe("Pending");
  });

  it("never touches a job that has started or finished", () => {
    for (const status of [
      "In Progress",
      "On Site",
      "En Route",
      "Completed",
      "completed",
      "Cancelled",
      "archived",
      "no_show",
      "incoming",
      "Awaiting Deposit",
    ]) {
      expect(deriveJobStatusFromParts(status, ["Open"])).toBe(null);
      expect(deriveJobStatusFromParts(status, ["Ready to Fit"])).toBe(null);
      expect(deriveJobStatusFromParts(status, [])).toBe(null);
    }
  });

  it("returns null when the status would not change", () => {
    expect(deriveJobStatusFromParts("parts_needed", ["Open"])).toBe(null);
  });

  it("returns null for a request with no job", () => {
    expect(deriveJobStatusFromParts(null, ["Open"])).toBe(null);
    expect(deriveJobStatusFromParts(undefined, ["Open"])).toBe(null);
  });
});

describe("buildPartsRequestRow", () => {
  const base = { organisationId: "org-1", serviceCallId: "job-1", customerId: "cust-1" };

  it("builds exactly one row for one part and never touches job notes", () => {
    const row = buildPartsRequestRow({ ...base, part: { description: "Thermocouple", priority: "urgent" } });
    expect(row).toMatchObject({ description: "Thermocouple", priority: "urgent", quantity: 1, status: "Open" });
    expect(row && "notes" in row).toBe(false);
  });

  it("keeps a supplied quantity and defaults invalid ones to 1", () => {
    expect(buildPartsRequestRow({ ...base, part: { description: "Flue seal", priority: "low", quantity: 2 } })?.quantity).toBe(2);
    expect(buildPartsRequestRow({ ...base, part: { description: "Flue seal", priority: "low", quantity: 0 } })?.quantity).toBe(1);
    expect(buildPartsRequestRow({ ...base, part: { description: "Flue seal", priority: "low", quantity: -3 } })?.quantity).toBe(1);
  });

  it("trims the description and rejects a blank part", () => {
    expect(buildPartsRequestRow({ ...base, part: { description: "  Pilot jet  ", priority: "normal" } })?.description).toBe("Pilot jet");
    expect(buildPartsRequestRow({ ...base, part: { description: "   ", priority: "normal" } })).toBe(null);
  });

  it("keeps typed-in customer details only when there is no customer record", () => {
    const withRecord = buildPartsRequestRow({
      ...base,
      customerName: "Ignored",
      part: { description: "Part", priority: "normal" },
    });
    expect(withRecord?.customer_name).toBe(null);

    const phonedIn = buildPartsRequestRow({
      organisationId: "org-1",
      customerId: null,
      serviceCallId: null,
      customerName: "Phoned In",
      customerPhone: "+353871234567",
      part: { description: "Part", priority: "normal" },
    });
    expect(phonedIn).toMatchObject({
      customer_name: "Phoned In",
      customer_phone: "+353871234567",
      service_call_id: null,
      customer_id: null,
    });
  });
});

describe("priorityRank", () => {
  it("orders urgent before normal before low, unknown last", () => {
    expect([null, "low", "urgent", "normal"].sort((a, b) => priorityRank(a) - priorityRank(b))).toEqual([
      "urgent",
      "normal",
      "low",
      null,
    ]);
  });
});
