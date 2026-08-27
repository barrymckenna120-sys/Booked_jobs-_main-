import { describe, it, expect } from "vitest";
import {
  alertMarkerKey,
  nextAlertMarker,
  selectCatchUpAlerts,
} from "@/lib/notificationAlerts";

/**
 * Live failure (parts bell): the `parts_requested` row inserted while the
 * office PWA was backgrounded arrived only via the next fetch, so the badge
 * updated but no sound played — the sound lived solely in the realtime path.
 * These assertions lock the catch-up selection used to alert on fetch.
 */
const row = (
  id: string,
  created_at: string,
  is_read = false,
  notification_type = "parts_requested",
) => ({ id, created_at, is_read, notification_type });

describe("notification catch-up alerts", () => {
  it("alerts on an unread parts request created after the marker", () => {
    const missed = selectCatchUpAlerts(
      [row("a", "2026-08-27T15:19:10Z")],
      "2026-08-27T15:00:00Z",
    );
    expect(missed.map((r) => r.id)).toEqual(["a"]);
  });

  it("never alerts on the first load (no marker yet)", () => {
    expect(selectCatchUpAlerts([row("a", "2026-08-27T15:19:10Z")], null)).toEqual([]);
  });

  it("ignores rows at or before the marker, and read rows", () => {
    const missed = selectCatchUpAlerts(
      [
        row("old", "2026-08-27T14:00:00Z"),
        row("same", "2026-08-27T15:00:00Z"),
        row("read", "2026-08-27T16:00:00Z", true),
      ],
      "2026-08-27T15:00:00Z",
    );
    expect(missed).toEqual([]);
  });

  it("returns newest first so the alert matches the latest event", () => {
    const missed = selectCatchUpAlerts(
      [row("a", "2026-08-27T15:10:00Z"), row("b", "2026-08-27T15:20:00Z")],
      "2026-08-27T15:00:00Z",
    );
    expect(missed[0].id).toBe("b");
  });

  it("advances the marker to the newest row so a reload does not replay", () => {
    const rows = [row("a", "2026-08-27T15:10:00Z"), row("b", "2026-08-27T15:20:00Z")];
    const marker = nextAlertMarker(rows, "2026-08-27T15:00:00Z");
    expect(marker).toBe("2026-08-27T15:20:00Z");
    expect(selectCatchUpAlerts(rows, marker)).toEqual([]);
  });

  it("never moves the marker backwards and survives empty fetches", () => {
    expect(nextAlertMarker([], "2026-08-27T15:00:00Z")).toBe("2026-08-27T15:00:00Z");
    expect(
      nextAlertMarker([row("a", "2026-08-27T14:00:00Z")], "2026-08-27T15:00:00Z"),
    ).toBe("2026-08-27T15:00:00Z");
  });

  it("keys the marker per user and surface so bells stay independent", () => {
    expect(alertMarkerKey("u1", "office")).not.toBe(alertMarkerKey("u1", "engineer"));
    expect(alertMarkerKey("u1", "office")).not.toBe(alertMarkerKey("u2", "office"));
  });
});
