import { describe, it, expect } from "vitest";
import {
  canResetOrgData,
  isSuperadminRole,
} from "../../../supabase/functions/_shared/resetRoles";

describe("canResetOrgData", () => {
  it("allows tenant owners (the get_user_role engineers-row value)", () => {
    // Regression: reset-org-data used to gate on ["admin","superadmin"] only,
    // so every tenant owner got 403 Insufficient permissions.
    expect(canResetOrgData("owner", "admin")).toBe(true);
    expect(canResetOrgData("owner", null)).toBe(true);
    expect(canResetOrgData("owner_manager", null)).toBe(true);
  });

  it("allows admin and superadmin from either source", () => {
    expect(canResetOrgData("admin", null)).toBe(true);
    expect(canResetOrgData("superadmin", null)).toBe(true);
    // Regression: an engineers row of "owner" must not mask a superadmin
    // profile, and vice versa.
    expect(canResetOrgData("engineer", "superadmin")).toBe(true);
    expect(canResetOrgData(null, "admin")).toBe(true);
  });

  it("refuses office, engineer, unknown and empty roles", () => {
    expect(canResetOrgData("office", "office")).toBe(false);
    expect(canResetOrgData("engineer", "engineer")).toBe(false);
    expect(canResetOrgData("manager", null)).toBe(false);
    expect(canResetOrgData(null, null)).toBe(false);
    expect(canResetOrgData("", "")).toBe(false);
    expect(canResetOrgData(undefined, undefined)).toBe(false);
  });
});

describe("isSuperadminRole", () => {
  it("is true when either source says superadmin", () => {
    expect(isSuperadminRole("superadmin", null)).toBe(true);
    expect(isSuperadminRole("owner", "superadmin")).toBe(true);
  });

  it("is false for every other role, including owner", () => {
    expect(isSuperadminRole("owner", "admin")).toBe(false);
    expect(isSuperadminRole("admin", "admin")).toBe(false);
    expect(isSuperadminRole(null, null)).toBe(false);
  });
});
