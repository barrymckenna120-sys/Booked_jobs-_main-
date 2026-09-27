import { describe, it, expect } from "vitest";
import { canRecover, statusLabel, type RestoreRow } from "./BackupsRestoreCard";

const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const stale = new Date(Date.now() - 45 * 60 * 1000).toISOString();

function row(overrides: Partial<RestoreRow> = {}): RestoreRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    backup_stamp: "2026-09-27-1300",
    mode: "dry_run",
    status: "succeeded",
    requested_at: recent,
    started_at: recent,
    finished_at: recent,
    report: { tables: [{ table: "customers", missing_from_live: 2 }] },
    error: null,
    ...overrides,
  };
}

describe("canRecover", () => {
  it("true for a fresh succeeded dry run with missing rows", () => {
    expect(canRecover(row())).toBe(true);
  });

  it("false when the dry run is older than 30 minutes", () => {
    expect(canRecover(row({ finished_at: stale }))).toBe(false);
  });

  it("false when nothing is missing", () => {
    expect(
      canRecover(row({ report: { tables: [{ table: "customers", missing_from_live: 0 }] } })),
    ).toBe(false);
  });

  it("false for non dry-run rows or non-succeeded statuses", () => {
    expect(canRecover(row({ mode: "recover_missing" }))).toBe(false);
    expect(canRecover(row({ status: "running" }))).toBe(false);
    expect(canRecover(row({ status: "failed" }))).toBe(false);
    expect(canRecover(row({ finished_at: null }))).toBe(false);
  });
});

describe("statusLabel", () => {
  it("shows 'recovered' for a succeeded recover_missing row", () => {
    expect(statusLabel(row({ mode: "recover_missing" }))).toBe("recovered");
  });

  it("keeps plain statuses otherwise", () => {
    expect(statusLabel(row())).toBe("succeeded");
    expect(statusLabel(row({ status: "failed" }))).toBe("failed");
  });
});
