import { describe, expect, it, beforeEach } from "vitest";
import {
  COLD_START_WINDOW_MS,
  consumeColdActivationBudget,
  hasSpentColdActivation,
  resetColdActivationBudget,
  shouldAutoActivateWaitingWorker,
} from "../swColdStart";

describe("shouldAutoActivateWaitingWorker", () => {
  beforeEach(() => {
    resetColdActivationBudget();
  });

  it("activates a waiting worker detected at cold launch", () => {
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: 1_200,
        alreadyActivated: false,
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
    expect(consumeColdActivationBudget()).toBe(true);
    expect(hasSpentColdActivation()).toBe(true);
    expect(consumeColdActivationBudget()).toBe(false);
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: 100,
        alreadyActivated: true,
      })
    ).toBe(false);
  });

  it("does not re-activate after the new worker takes control", () => {
    consumeColdActivationBudget();
    // Fresh cold-start-looking conditions after controllerchange + reload.
    expect(
      shouldAutoActivateWaitingWorker({
        needRefresh: true,
        elapsedMs: 200,
        alreadyActivated: hasSpentColdActivation(),
      })
    ).toBe(false);
  });
});
