import { describe, it, expect } from "vitest";
import { buildManualCancelPatch } from "./cancelJobPatch";

const now = new Date("2026-08-26T11:50:00.000Z");

describe("buildManualCancelPatch", () => {
  it("clears a stale confirmation (regression: manual cancel kept confirmed=true)", () => {
    const p = buildManualCancelPatch("Customer Cancelled", "", "user-1", now);
    expect(p.status).toBe("Cancelled");
    expect(p.confirmed).toBe(false);
    expect(p.confirmed_at).toBeNull();
  });

  it("keeps reason, note and actor, normalising empties to null", () => {
    expect(buildManualCancelPatch("Other", "  extra  ", "u1", now)).toMatchObject({
      cancellation_reason: "Other",
      cancellation_note: "  extra  ",
      cancelled_by: "u1",
      cancelled_at: "2026-08-26T11:50:00.000Z",
    });
    const blank = buildManualCancelPatch("Other", "", undefined, now);
    expect(blank.cancellation_note).toBeNull();
    expect(blank.cancelled_by).toBeNull();
  });
});
