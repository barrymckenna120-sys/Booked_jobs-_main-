import { describe, expect, it } from "vitest";
import { describeOrgBinding } from "../../../supabase/functions/_shared/bindingDiagnostics";

const ORG_A = "org-a";
const ORG_B = "org-b";

describe("describeOrgBinding", () => {
  it("marks a per-tenant secret binding as authenticated, not a fallback", () => {
    const d = describeOrgBinding({
      via: "tenant_secret",
      resolvedOrgId: ORG_A,
      claimedOrgId: ORG_A,
      secretHeaderPresent: true,
      sharedSecretPresent: false,
      bearerPresent: false,
      submittedFormId: "b5QkdZ",
    });
    expect(d.org_binding_is_fallback).toBe(false);
    expect(d.org_binding_authenticated).toBe(true);
    expect(d.org_binding_fallback_reason).toBeNull();
    expect(d.org_binding_claim_matches_resolved).toBe(true);
  });

  it("records an unauthenticated fallback with no credentials at all", () => {
    const d = describeOrgBinding({
      via: "unbound_claim",
      resolvedOrgId: ORG_B,
      claimedOrgId: ORG_B,
      secretHeaderPresent: false,
      sharedSecretPresent: false,
      bearerPresent: false,
      submittedFormId: null,
    });
    expect(d.org_binding_is_fallback).toBe(true);
    expect(d.org_binding_authenticated).toBe(false);
    expect(d.org_binding_fallback_reason).toBe("no_credentials_presented_and_no_form_reference");
    expect(d.org_binding_claimed_organisation_id).toBe(ORG_B);
  });

  it("distinguishes a shared-secret-only sender from an unrecognised tenant secret", () => {
    const shared = describeOrgBinding({
      via: "unbound_claim",
      resolvedOrgId: ORG_A,
      claimedOrgId: ORG_A,
      secretHeaderPresent: false,
      sharedSecretPresent: true,
      bearerPresent: false,
      submittedFormId: "abc123",
    });
    expect(shared.org_binding_fallback_reason).toBe("shared_secret_only_no_tenant_secret");

    const unknown = describeOrgBinding({
      via: "unbound_claim",
      resolvedOrgId: ORG_A,
      claimedOrgId: ORG_A,
      secretHeaderPresent: true,
      sharedSecretPresent: false,
      bearerPresent: false,
      submittedFormId: "abc123",
    });
    expect(unknown.org_binding_fallback_reason).toBe("tenant_secret_unrecognised");
  });

  it("normalises blank claim and form values to null", () => {
    const d = describeOrgBinding({
      via: "integration_identifier",
      resolvedOrgId: ORG_A,
      claimedOrgId: "   ",
      secretHeaderPresent: false,
      sharedSecretPresent: true,
      bearerPresent: false,
      submittedFormId: "  ",
    });
    expect(d.org_binding_claimed_organisation_id).toBeNull();
    expect(d.org_binding_submitted_form_id).toBeNull();
    expect(d.org_binding_claim_matches_resolved).toBeNull();
  });

  it("records no customer contact details", () => {
    const d = describeOrgBinding({
      via: "unbound_claim",
      resolvedOrgId: ORG_A,
      claimedOrgId: ORG_A,
      secretHeaderPresent: false,
      sharedSecretPresent: false,
      bearerPresent: false,
      submittedFormId: null,
    });
    const serialised = JSON.stringify(d).toLowerCase();
    for (const forbidden of ["phone", "email", "mobile", "address", "eircode", "name"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
