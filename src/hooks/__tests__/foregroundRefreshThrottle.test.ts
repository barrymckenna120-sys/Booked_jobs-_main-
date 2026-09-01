import { describe, it, expect } from "vitest";
import {
  shouldRunForegroundRefresh,
  FOREGROUND_REFRESH_WINDOW_MS,
} from "@/hooks/useNotifications";

describe("shouldRunForegroundRefresh (tab-return dedupe)", () => {
  it("runs on the first foreground of the session", () => {
    expect(shouldRunForegroundRefresh(0, 1_000_000)).toBe(true);
  });

  it("skips the second event of the same tab switch (visibilitychange then focus)", () => {
    const t = 1_000_000;
    expect(shouldRunForegroundRefresh(t, t + 30)).toBe(false);
  });

  it("skips anything inside the window", () => {
    const t = 1_000_000;
    expect(
      shouldRunForegroundRefresh(t, t + FOREGROUND_REFRESH_WINDOW_MS - 1)
    ).toBe(false);
  });

  it("runs again once the window has elapsed", () => {
    const t = 1_000_000;
    expect(
      shouldRunForegroundRefresh(t, t + FOREGROUND_REFRESH_WINDOW_MS)
    ).toBe(true);
    expect(shouldRunForegroundRefresh(t, t + 10_000)).toBe(true);
  });
});
