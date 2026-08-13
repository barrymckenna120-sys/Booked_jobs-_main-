import { describe, it, expect } from "vitest";
import { calcDepositAmount, resolveDepositPercentage, DEFAULT_DEPOSIT_PERCENTAGE } from "../depositCalc";

describe("resolveDepositPercentage", () => {
  it("falls back to 50 when null or undefined", () => {
    expect(resolveDepositPercentage(null)).toBe(DEFAULT_DEPOSIT_PERCENTAGE);
    expect(resolveDepositPercentage(undefined)).toBe(DEFAULT_DEPOSIT_PERCENTAGE);
  });

  it("keeps a real configured value, including 0", () => {
    expect(resolveDepositPercentage(30)).toBe(30);
    expect(resolveDepositPercentage(0)).toBe(0);
  });
});

describe("calcDepositAmount", () => {
  it("calculates the configured percentage of the total", () => {
    expect(calcDepositAmount(800, 50)).toBe(400);
    expect(calcDepositAmount(800, 25)).toBe(200);
  });

  it("uses the 50% fallback when percentage is unset", () => {
    expect(calcDepositAmount(800, null)).toBe(400);
    expect(calcDepositAmount(800, undefined)).toBe(400);
  });

  it("is cent-safe on awkward totals", () => {
    expect(calcDepositAmount(333.33, 33)).toBe(110);
    expect(calcDepositAmount(0.05, 50)).toBe(0.03);
    expect(calcDepositAmount(119.99, 50)).toBe(60);
  });

  it("returns 0 for invalid or non-positive totals", () => {
    expect(calcDepositAmount(0, 50)).toBe(0);
    expect(calcDepositAmount(NaN, 50)).toBe(0);
    expect(calcDepositAmount(-100, 50)).toBe(0);
  });
});
