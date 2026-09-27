import { describe, it, expect } from "vitest";
import { formatDublin, formatMB, formatDuration, hasActive } from "./restoreFormat";

describe("restoreFormat", () => {
  it("formats in Europe/Dublin as DD/MM/YY HH:mm (IST in summer)", () => {
    expect(formatDublin("2026-09-27T02:05:00Z")).toBe("27/09/26 03:05");
  });
  it("formats winter time (GMT)", () => {
    expect(formatDublin("2026-01-05T02:05:00Z")).toBe("05/01/26 02:05");
  });
  it("handles null/invalid", () => {
    expect(formatDublin(null)).toBe("—");
    expect(formatDublin("nope")).toBe("—");
  });
  it("formats MB", () => {
    expect(formatMB(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatMB(null)).toBe("—");
  });
  it("formats duration", () => {
    expect(formatDuration("2026-09-27T02:00:00Z", "2026-09-27T02:02:05Z")).toBe("2m 5s");
    expect(formatDuration("2026-09-27T02:00:00Z", null)).toBe("—");
  });
  it("detects active rows", () => {
    expect(hasActive([{ status: "succeeded" }, { status: "running" }])).toBe(true);
    expect(hasActive([{ status: "failed" }])).toBe(false);
  });
});
