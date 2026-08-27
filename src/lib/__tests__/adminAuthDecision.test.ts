import { describe, it, expect } from "vitest";
import {
  decideAdminAuthority,
  mayActOnTarget,
  TENANT_ADMIN_ROLES,
} from "../../../supabase/functions/_shared/adminAuthDecision.ts";

const OWNERS = ["owner@platform.test"];
const DG = "org-dublin";
const KN = "org-kn";

describe("admin authority decision (Band 5)", () => {
  it("superadmin role grants platform authority", () => {
    const a = decideAdminAuthority({ role: "superadmin", email: "x@y.z" }, OWNERS);
    expect(a).toMatchObject({ platformAdmin: true, tenantAdmin: true, via: "role" });
  });

  it("centralized platform-owner email grants platform authority (case/space insensitive)", () => {
    const a = decideAdminAuthority({ role: "office", email: "  Owner@Platform.TEST " }, OWNERS);
    expect(a.platformAdmin).toBe(true);
    expect(a.via).toBe("platform_owner_env");
  });

  it("a stale email not in the central config gets no platform authority", () => {
    const a = decideAdminAuthority({ role: "office", email: "former.owner@old.test" }, OWNERS);
    expect(a.platformAdmin).toBe(false);
    expect(a.tenantAdmin).toBe(true); // still a tenant admin by role
  });

  it("keeps tenant admin roles working without platform authority", () => {
    for (const role of TENANT_ADMIN_ROLES) {
      const a = decideAdminAuthority({ role, email: "u@dg.test" }, OWNERS);
      expect(a).toMatchObject({ platformAdmin: false, tenantAdmin: true, authorized: true });
    }
  });

  it("denies engineers and unknown roles", () => {
    for (const role of ["engineer", "", null, "viewer"]) {
      const a = decideAdminAuthority({ role, email: "eng@dg.test" }, OWNERS);
      expect(a.authorized).toBe(false);
      expect(a.platformAdmin).toBe(false);
    }
  });

  it("treats an organisation owner as a tenant admin only", () => {
    const a = decideAdminAuthority({ role: null, email: "boss@dg.test", ownsOrg: true }, OWNERS);
    expect(a).toMatchObject({ platformAdmin: false, tenantAdmin: true, via: "org_owner" });
  });

  it("ignores an empty central allowlist (no accidental bypass)", () => {
    expect(decideAdminAuthority({ role: "office", email: "" }, []).platformAdmin).toBe(false);
    expect(decideAdminAuthority({ role: null, email: null }, []).authorized).toBe(false);
  });
});

describe("cross-tenant target guard", () => {
  const tenant = { platformAdmin: false, tenantAdmin: true };
  const platform = { platformAdmin: true, tenantAdmin: true };

  it("tenant admin may act inside own org only", () => {
    expect(mayActOnTarget(tenant, DG, DG)).toBe(true);
    expect(mayActOnTarget(tenant, DG, KN)).toBe(false);
    expect(mayActOnTarget(tenant, KN, DG)).toBe(false);
  });

  it("fails closed when either org is unknown", () => {
    expect(mayActOnTarget(tenant, null, DG)).toBe(false);
    expect(mayActOnTarget(tenant, DG, null)).toBe(false);
    expect(mayActOnTarget(tenant, undefined, undefined)).toBe(false);
  });

  it("platform admin may act across tenants", () => {
    expect(mayActOnTarget(platform, DG, KN)).toBe(true);
    expect(mayActOnTarget(platform, null, KN)).toBe(true);
  });

  it("a non-admin is never allowed, even same-org", () => {
    expect(mayActOnTarget({ platformAdmin: false, tenantAdmin: false }, DG, DG)).toBe(false);
  });
});
