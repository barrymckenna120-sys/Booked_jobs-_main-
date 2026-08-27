import { describe, expect, it } from "vitest";
import { shouldShowOnSurface, surfaceRoleScope } from "./notificationSurface";

describe("notification surface scoping", () => {
  it("hides office alerts (e.g. SumUp payment_failed) from the Engineer App", () => {
    expect(shouldShowOnSurface("office", "engineer")).toBe(false);
    expect(shouldShowOnSurface("admin", "engineer")).toBe(false);
    expect(shouldShowOnSurface(null, "engineer")).toBe(false);
  });

  it("keeps engineer alerts on the Engineer App", () => {
    expect(shouldShowOnSurface("engineer", "engineer")).toBe(true);
  });

  it("keeps office alerts on the Office App and drops engineer-scoped copies", () => {
    expect(shouldShowOnSurface("office", "office")).toBe(true);
    expect(shouldShowOnSurface("admin", "office")).toBe(true);
    // quote_accepted rows are written with role 'office'
    expect(shouldShowOnSurface(null, "office")).toBe(true);
    expect(shouldShowOnSurface("engineer", "office")).toBe(false);
  });

  it("shows everything when no surface is given", () => {
    expect(shouldShowOnSurface("office", undefined)).toBe(true);
    expect(shouldShowOnSurface("engineer", undefined)).toBe(true);
    expect(surfaceRoleScope(undefined)).toBeNull();
    expect(surfaceRoleScope("engineer")).toBe("engineer");
  });
});
