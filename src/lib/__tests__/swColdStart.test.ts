import { describe, expect, it, beforeEach } from "vitest";
import {
  COLD_START_WINDOW_MS,
  consumeColdActivationBudget,
  hasSpentColdActivation,
  resetColdActivationBudget,
  shouldAutoActivateWaitingWorker,
} from "../swColdStart";

/** Minimal in-memory stand-in for sessionStorage (tests run in node env). */
function makeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("shouldAutoActivateWaitingWorker", () => {
  let store = makeStore();

  beforeEach(() => {
    store = makeStore();
    resetColdActivationBudget(store);
  });

  it("activates a waiting worker detected at cold launch", () => {
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: 1_200,
        alreadyActivated: hasSpentColdActivation(store),
      })
    ).toBe(true);
  });

  it("does nothing when there is no waiting worker", () => {
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: false,
        elapsedMs: 500,
        alreadyActivated: false,
      })
    ).toBe(false);
  });

  it("keeps the prompt for an update that appears during active use", () => {
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: COLD_START_WINDOW_MS + 1,
        alreadyActivated: false,
      })
    ).toBe(false);
  });

  it("never activates twice in one session (at most one reload)", () => {
    expect(consumeColdActivationBudget(store)).toBe(true);
    expect(hasSpentColdActivation(store)).toBe(true);
    expect(consumeColdActivationBudget(store)).toBe(false);
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: 100,
        alreadyActivated: true,
      })
    ).toBe(false);
  });

  it("does not re-activate after the new worker takes control", () => {
    consumeColdActivationBudget(store);
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: 200,
        alreadyActivated: hasSpentColdActivation(store),
      })
    ).toBe(false);
  });

  it("allows a later deployment after the previous update has settled", () => {
    expect(consumeColdActivationBudget(store)).toBe(true);
    resetColdActivationBudget(store);
    expect(hasSpentColdActivation(store)).toBe(false);
    expect(consumeColdActivationBudget(store)).toBe(true);
  });

  it("refuses auto-activation when no durable storage exists (loop safety)", () => {
    expect(hasSpentColdActivation(null)).toBe(true);
    expect(consumeColdActivationBudget(null)).toBe(false);
  });
});
