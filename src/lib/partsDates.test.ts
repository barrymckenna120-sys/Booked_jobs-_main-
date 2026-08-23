import { describe, expect, it } from "vitest";
import { formatPartStatusStamp, formatPartTimestamp } from "./partsDates";

const isoAt = (offsetDays: number, hours: number, minutes: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

describe("formatPartTimestamp", () => {
  it("shows today with the time", () => {
    expect(formatPartTimestamp(isoAt(0, 14, 23))).toBe("Today, 2:23pm");
  });

  it("shows yesterday with the time", () => {
    expect(formatPartTimestamp(isoAt(-1, 9, 5))).toBe("Yesterday, 9:05am");
  });

  it("keeps the time for older rows (BJ-0066 regression)", () => {
    const older = new Date(2026, 6, 27, 13, 42, 0).toISOString();
    expect(formatPartTimestamp(older)).toBe("27 Jul 2026, 1:42pm");
  });

  it("returns an empty string for missing or invalid input", () => {
    expect(formatPartTimestamp(null)).toBe("");
    expect(formatPartTimestamp(undefined)).toBe("");
    expect(formatPartTimestamp("not-a-date")).toBe("");
  });
});

describe("formatPartStatusStamp", () => {
  const ordered = new Date(2026, 7, 14, 7, 26, 0).toISOString();
  const ready = new Date(2026, 7, 14, 7, 27, 0).toISOString();
  const cancelled = new Date(2026, 7, 15, 10, 0, 0).toISOString();

  it("returns null while the request is still open", () => {
    expect(formatPartStatusStamp({})).toBeNull();
  });

  it("reports the ordered stamp", () => {
    expect(formatPartStatusStamp({ ordered_at: ordered })).toEqual({
      label: "Ordered",
      value: "14 Aug 2026, 7:26am",
    });
  });

  it("prefers ready over ordered", () => {
    expect(formatPartStatusStamp({ ordered_at: ordered, ready_at: ready })?.label).toBe("Ready");
  });

  it("prefers cancelled over everything", () => {
    expect(
      formatPartStatusStamp({ ordered_at: ordered, ready_at: ready, cancelled_at: cancelled })?.label,
    ).toBe("Cancelled");
  });
});
