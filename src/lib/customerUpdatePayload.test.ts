import { describe, it, expect } from "vitest";
import { buildCustomerUpdatePayload } from "./customerUpdatePayload";

const base = {
  id: "c1",
  user_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  name: "Barry",
  phone: "353871234567",
  opted_out: false,
  notes: null,
  warranty_reminder_log: { sent: 1 },
};

describe("buildCustomerUpdatePayload", () => {
  it("returns an empty payload when nothing changed", () => {
    expect(buildCustomerUpdatePayload({ ...base }, { ...base })).toEqual({});
  });

  it("includes only changed fields", () => {
    const payload = buildCustomerUpdatePayload(
      { ...base, name: "Barry O'Neill" },
      base,
    );
    expect(payload).toEqual({ name: "Barry O'Neill" });
  });

  it("never includes immutable fields", () => {
    const payload = buildCustomerUpdatePayload(
      { ...base, id: "hacked", user_id: "other", created_at: "x", updated_at: "y", name: "New" },
      base,
    );
    expect(Object.keys(payload)).toEqual(["name"]);
  });

  // Regression: stale opted_out must never overwrite a backend opt-out
  it("does not resend opted_out when the user never touched it", () => {
    const original = { ...base, opted_out: false };
    const form = { ...base, opted_out: false, name: "Edited" };
    const payload = buildCustomerUpdatePayload(form, original);
    expect(payload).not.toHaveProperty("opted_out");
  });

  it("sends opted_out only when the toggle was actually changed", () => {
    const payload = buildCustomerUpdatePayload(
      { ...base, opted_out: true },
      base,
    );
    expect(payload).toEqual({ opted_out: true });
  });

  it("respects a realtime-synced opted_out value pushed into both form and original", () => {
    // Realtime handler sets opted_out on form AND originalForm
    const original = { ...base, opted_out: true };
    const form = { ...base, opted_out: true, engineer_notes: "boiler in attic" };
    const payload = buildCustomerUpdatePayload(form, original);
    expect(payload).toEqual({ engineer_notes: "boiler in attic" });
  });

  it("treats null and undefined as equal (no spurious writes)", () => {
    const payload = buildCustomerUpdatePayload(
      { ...base, notes: undefined },
      { ...base, notes: null },
    );
    expect(payload).toEqual({});
  });

  it("detects object field changes", () => {
    const payload = buildCustomerUpdatePayload(
      { ...base, warranty_reminder_log: { sent: 2 } },
      base,
    );
    expect(payload).toEqual({ warranty_reminder_log: { sent: 2 } });
  });

  it("allows clearing a field to null", () => {
    const payload = buildCustomerUpdatePayload(
      { ...base, engineer_notes: null },
      { ...base, engineer_notes: "old note" },
    );
    expect(payload).toEqual({ engineer_notes: null });
  });
});
