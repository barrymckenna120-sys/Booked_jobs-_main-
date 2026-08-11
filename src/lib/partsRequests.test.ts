import { describe, it, expect } from "vitest";
import { deriveJobStatusFromParts, buildPartsRequestRows, priorityRank } from "./partsRequests";

describe("deriveJobStatusFromParts", () => {
  it("flags Parts Needed when any line is Open", () => {
    expect(deriveJobStatusFromParts("Scheduled", ["Open", "Ordered"])).toBe("parts_needed");
  });

  it("falls back to Parts Ordered when nothing is Open", () => {
    expect(deriveJobStatusFromParts("Scheduled", ["Ordered", "Ready to Fit"])).toBe("parts_ordered");
  });

  it("uses Awaiting Booking when everything is Ready to Fit", () => {
    expect(deriveJobStatusFromParts("Booked", ["Ready to Fit"])).toBe("parts_arrived");
  });

  it("ignores Cancelled lines", () => {
    expect(deriveJobStatusFromParts("Scheduled", ["Cancelled"])).toBe(null);
    expect(deriveJobStatusFromParts("parts_needed", ["Cancelled"])).toBe("Scheduled");
  });

  it("hands a parts job back to Scheduled when no active lines remain", () => {
    expect(deriveJobStatusFromParts("parts_ordered", [])).toBe("Scheduled");
  });

  it("never touches Completed", () => {
    expect(deriveJobStatusFromParts("Completed", ["Open"])).toBe(null);
  });

  it("never touches Cancelled", () => {
    expect(deriveJobStatusFromParts("Cancelled", ["Open"])).toBe(null);
  });

  it("never touches In Progress — the on-site signal is preserved", () => {
    expect(deriveJobStatusFromParts("In Progress", ["Open"])).toBe(null);
    expect(deriveJobStatusFromParts("In Progress", ["Ready to Fit"])).toBe(null);
  });

  it("never touches no_show, Pending or Awaiting Deposit", () => {
    for (const status of ["no_show", "Pending", "Awaiting Deposit"]) {
      expect(deriveJobStatusFromParts(status, ["Open"])).toBe(null);
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

describe("buildPartsRequestRows", () => {
  const base = { organisationId: "org-1", serviceCallId: "job-1", customerId: "cust-1" };

  it("emits one row per line and never touches job notes", () => {
    const rows = buildPartsRequestRows({
      ...base,
      lines: [
        { description: "Thermocouple", priority: "urgent" },
        { description: "Flue seal", priority: "low", quantity: 2 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ description: "Thermocouple", priority: "urgent", quantity: 1, status: "Open" });
    expect(rows[1]).toMatchObject({ description: "Flue seal", priority: "low", quantity: 2 });
    expect(rows.some((r) => "notes" in r)).toBe(false);
    expect(rows.some((r) => "status_job" in r)).toBe(false);
  });

  it("drops blank lines and trims descriptions", () => {
    const rows = buildPartsRequestRows({
      ...base,
      lines: [
        { description: "  Pilot jet  ", priority: "normal" },
        { description: "   ", priority: "normal" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Pilot jet");
  });

  it("keeps typed-in customer details only when there is no customer record", () => {
    const withRecord = buildPartsRequestRows({
      ...base,
      customerName: "Ignored",
      lines: [{ description: "Part", priority: "normal" }],
    });
    expect(withRecord[0].customer_name).toBe(null);

    const withoutRecord = buildPartsRequestRows({
      organisationId: "org-1",
      customerId: null,
      serviceCallId: null,
      customerName: "Phoned In",
      customerPhone: "+353871234567",
      lines: [{ description: "Part", priority: "normal" }],
    });
    expect(withoutRecord[0]).toMatchObject({
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
