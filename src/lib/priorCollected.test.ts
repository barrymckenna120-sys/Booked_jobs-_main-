import { describe, it, expect } from "vitest";
import { priorCollected } from "./priorCollected";

describe("priorCollected", () => {
  it("matches the old deposit-only logic on a single-deposit job (KN-519)", () => {
    // revenue 500, balance 250, deposit 250 → old logic gave 250
    expect(priorCollected(500, 250)).toBe(250);
  });

  it("returns 0 when a required deposit has not been paid yet (case D)", () => {
    expect(priorCollected(500, 500)).toBe(0);
  });

  it("returns 0 on a no-deposit job (case C)", () => {
    expect(priorCollected(400, 400)).toBe(0);
  });

  it("returns 0 for an unpriced job", () => {
    expect(priorCollected(null, null)).toBe(0);
    expect(priorCollected(0, 0)).toBe(0);
    expect(priorCollected(undefined, 120)).toBe(0);
  });

  it("returns 0 when balance_due is unset", () => {
    expect(priorCollected(500, null)).toBe(0);
    expect(priorCollected(500, undefined)).toBe(0);
  });

  it("is cumulative across two or more prior partial payments", () => {
    // revenue 900, 250 + 200 already collected → balance 450
    expect(priorCollected(900, 450)).toBe(450);
  });

  it("clamps a stale balance_due greater than revenue to 0", () => {
    expect(priorCollected(300, 500)).toBe(0);
  });

  it("rounds to two decimals", () => {
    expect(priorCollected(100.05, 33.34)).toBe(66.71);
  });

  it("ignores non-numeric input", () => {
    expect(priorCollected(Number.NaN, 100)).toBe(0);
    expect(priorCollected(500, Number.NaN)).toBe(0);
  });
});
