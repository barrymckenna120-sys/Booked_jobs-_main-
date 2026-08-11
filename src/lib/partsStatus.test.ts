import { describe, it, expect } from "vitest";
import {
  PART_STATUS_ICON_KEY,
  PART_STATUSES,
  isOfficeUpdate,
  OFFICE_UPDATE_TOLERANCE_MS,
  buildPartsRequestRow,
} from "./partsStatus";

describe("PART_STATUS_ICON_KEY", () => {
  it("covers every part status", () => {
    PART_STATUSES.forEach((status) => {
      expect(PART_STATUS_ICON_KEY[status]).toBeTruthy();
    });
  });

  it("uses PackageCheck for Ready to Fit, never the job Complete checkmark", () => {
    expect(PART_STATUS_ICON_KEY["Ready to Fit"]).toBe("PackageCheck");
    Object.values(PART_STATUS_ICON_KEY).forEach((key) => {
      expect(key).not.toBe("CheckCircle2");
    });
  });

  it("gives each status a distinct glyph", () => {
    const keys = Object.values(PART_STATUS_ICON_KEY);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isOfficeUpdate", () => {
  const created = "2026-08-11T09:00:00.000Z";
  const plus = (ms: number) => new Date(new Date(created).getTime() + ms).toISOString();

  it("is false for a freshly created row", () => {
    expect(isOfficeUpdate({ created_at: created, updated_at: created, status: "Open" })).toBe(false);
  });

  it("is true for a row office moved on and edited later", () => {
    expect(
      isOfficeUpdate({ created_at: created, updated_at: plus(60_000), status: "Ordered" }),
    ).toBe(true);
    expect(
      isOfficeUpdate({ created_at: created, updated_at: plus(60_000), status: "Ready to Fit" }),
    ).toBe(true);
    expect(
      isOfficeUpdate({ created_at: created, updated_at: plus(60_000), status: "Cancelled" }),
    ).toBe(true);
  });

  it("is false for an Open row even when updated_at has moved", () => {
    expect(
      isOfficeUpdate({ created_at: created, updated_at: plus(60_000), status: "Open" }),
    ).toBe(false);
  });

  it("absorbs insert timestamp jitter under the tolerance", () => {
    expect(
      isOfficeUpdate({ created_at: created, updated_at: plus(500), status: "Ordered" }),
    ).toBe(false);
    expect(
      isOfficeUpdate({
        created_at: created,
        updated_at: plus(OFFICE_UPDATE_TOLERANCE_MS),
        status: "Ordered",
      }),
    ).toBe(false);
    expect(
      isOfficeUpdate({
        created_at: created,
        updated_at: plus(OFFICE_UPDATE_TOLERANCE_MS + 1),
        status: "Ordered",
      }),
    ).toBe(true);
  });

  it("is false when either timestamp is missing or unparseable", () => {
    expect(isOfficeUpdate({ created_at: null, updated_at: plus(60_000), status: "Ordered" })).toBe(false);
    expect(isOfficeUpdate({ created_at: created, updated_at: null, status: "Ordered" })).toBe(false);
    expect(isOfficeUpdate({ created_at: "not-a-date", updated_at: plus(60_000), status: "Ordered" })).toBe(false);
  });
});

describe("buildPartsRequestRow engineer link", () => {
  it("stamps engineer_id from the logging user so office updates can notify them", () => {
    const row = buildPartsRequestRow({
      part: { description: "Pump", priority: "urgent" },
      organisationId: "org-1",
      loggedBy: "user-1",
      loggedByName: "Karl",
    });
    expect(row?.engineer_id).toBe("user-1");
    expect(row?.logged_by).toBe("user-1");
  });

  it("leaves engineer_id null when there is no logging user", () => {
    const row = buildPartsRequestRow({
      part: { description: "Pump", priority: "low" },
      organisationId: "org-1",
    });
    expect(row?.engineer_id).toBeNull();
  });
});
