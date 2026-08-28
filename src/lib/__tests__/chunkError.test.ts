import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isChunkLoadError,
  consumeChunkReloadBudget,
  hasAttemptedChunkReload,
  maybeReloadForChunkError,
  resetChunkReloadBudget,
} from "../chunkError";

/** Minimal sessionStorage + window.location.reload stand-ins (node env). */
function stubBrowser() {
  const store = new Map<string, string>();
  const reload = vi.fn();

  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", { location: { reload } });

  return { reload };
}

describe("isChunkLoadError", () => {
  it("detects ChunkLoadError by name", () => {
    const err = new Error("boom");
    err.name = "ChunkLoadError";
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("detects dynamic import failures", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: /assets/Jobs-a1b2.js")
      )
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("error loading dynamically imported module"))
    ).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError("Unable to preload CSS for /assets/x.css")).toBe(true);
  });

  it("ignores ordinary errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("reload budget", () => {
  beforeEach(() => {
    stubBrowser();
    resetChunkReloadBudget();
  });

  it("allows exactly one reload per session", () => {
    expect(hasAttemptedChunkReload()).toBe(false);
    expect(consumeChunkReloadBudget()).toBe(true);
    expect(hasAttemptedChunkReload()).toBe(true);
    expect(consumeChunkReloadBudget()).toBe(false);
    expect(consumeChunkReloadBudget()).toBe(false);
  });
});

describe("maybeReloadForChunkError", () => {
  it("reloads once for a chunk error and never again", () => {
    const { reload } = stubBrowser();
    resetChunkReloadBudget();

    const err = new Error("Failed to fetch dynamically imported module");
    expect(maybeReloadForChunkError(err)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(maybeReloadForChunkError(err)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads for a non-chunk error", () => {
    const { reload } = stubBrowser();
    resetChunkReloadBudget();

    expect(maybeReloadForChunkError(new Error("nope"))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(hasAttemptedChunkReload()).toBe(false);
  });
});
