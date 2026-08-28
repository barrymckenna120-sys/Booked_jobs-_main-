import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isChunkLoadError,
  consumeChunkReloadBudget,
  hasAttemptedChunkReload,
  maybeReloadForChunkError,
  resetChunkReloadBudget,
} from "../chunkError";

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
  beforeEach(() => {
    resetChunkReloadBudget();
  });

  it("reloads once for a chunk error and never again", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });

    const err = new Error("Failed to fetch dynamically imported module");
    expect(maybeReloadForChunkError(err)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(maybeReloadForChunkError(err)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads for a non-chunk error", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload },
      writable: true,
    });

    expect(maybeReloadForChunkError(new Error("nope"))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(hasAttemptedChunkReload()).toBe(false);
  });
});
