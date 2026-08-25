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

  it("shows everything on the Office App (no scoping)", () => {
    expect(shouldShowOnSurface("office", undefined)).toBe(true);
    expect(shouldShowOnSurface("engineer", undefined)).toBe(true);
    expect(surfaceRoleScope(undefined)).toBeNull();
    expect(surfaceRoleScope("engineer")).toBe("engineer");
  });
});
