import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveLandingPathSafe, LANDING_FALLBACK_PATH } from "../resolveLandingPath";
import { shouldShowStartupTimeout, STARTUP_TIMEOUT_MS } from "../startupFallback";

describe("resolveLandingPathSafe", () => {
  afterEach(() => vi.useRealTimers());

  it("passes a successful lookup through unchanged", async () => {
    await expect(resolveLandingPathSafe("u1", async () => "/dashboard")).resolves.toBe("/dashboard");
  });

  it("falls back to the least-privileged path when the lookup rejects", async () => {
    await expect(
      resolveLandingPathSafe("u1", async () => {
        throw new Error("Load failed");
      })
    ).resolves.toBe(LANDING_FALLBACK_PATH);
  });

  it("falls back when the lookup never settles", async () => {
    vi.useFakeTimers();
    const pending = resolveLandingPathSafe("u1", () => new Promise<string>(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe(LANDING_FALLBACK_PATH);
  });
});

describe("shouldShowStartupTimeout", () => {
  it("stays hidden before the ceiling and shows at or after it", () => {
    expect(shouldShowStartupTimeout(0)).toBe(false);
    expect(shouldShowStartupTimeout(STARTUP_TIMEOUT_MS - 1)).toBe(false);
    expect(shouldShowStartupTimeout(STARTUP_TIMEOUT_MS)).toBe(true);
    expect(shouldShowStartupTimeout(STARTUP_TIMEOUT_MS + 5000)).toBe(true);
  });

  it("never cuts short a request still inside its own 15s timeout", () => {
    expect(STARTUP_TIMEOUT_MS).toBeGreaterThan(15_000);
    expect(shouldShowStartupTimeout(15_000)).toBe(false);
  });
});
