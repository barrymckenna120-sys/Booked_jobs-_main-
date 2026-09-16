// How a machine/webhook submission was bound to a tenant — recorded, not enforced.
//
// Stage 1 of closing the "self-declared organisation" gap: every submission
// records which route identified the tenant so unauthenticated arrivals (via
// "unbound_claim") are visible and the offending sender can be corrected before
// strict binding is switched on. Contains no customer contact details.

export type OrgBindingFacts = {
  /** `bindMachineOrganisation` result: tenant_secret | integration_identifier | service_role | unbound_claim */
  via: string;
  /** Organisation the submission was actually stored under. */
  resolvedOrgId: string;
  /** Organisation named inside the request body, if any. */
  claimedOrgId?: string | null;
  /** A per-tenant webhook secret header was presented (value never recorded). */
  secretHeaderPresent: boolean;
  /** The shared platform secret was presented instead of a per-tenant one. */
  sharedSecretPresent: boolean;
  /** A bearer token was presented (service-role callers). */
  bearerPresent: boolean;
  /** Form reference the sender supplied, if any. */
  submittedFormId?: string | null;
};

export type OrgBindingDiagnostics = {
  org_binding_via: string;
  /** True when the tenant came only from the body's own claim — the residual gap. */
  org_binding_is_fallback: boolean;
  org_binding_authenticated: boolean;
  org_binding_claimed_organisation_id: string | null;
  org_binding_claim_matches_resolved: boolean | null;
  org_binding_secret_header_present: boolean;
  org_binding_shared_secret_present: boolean;
  org_binding_bearer_present: boolean;
  org_binding_submitted_form_id: string | null;
  /** Why the fallback was needed, in one reviewable phrase. */
  org_binding_fallback_reason: string | null;
};

export function describeOrgBinding(facts: OrgBindingFacts): OrgBindingDiagnostics {
  const claimed = facts.claimedOrgId?.trim() || null;
  const isFallback = facts.via === "unbound_claim";
  const formId = facts.submittedFormId?.trim() || null;

  let fallbackReason: string | null = null;
  if (isFallback) {
    if (!facts.secretHeaderPresent && !facts.sharedSecretPresent && !facts.bearerPresent) {
      fallbackReason = "no_credentials_presented";
    } else if (!facts.secretHeaderPresent) {
      fallbackReason = "shared_secret_only_no_tenant_secret";
    } else {
      fallbackReason = "tenant_secret_unrecognised";
    }
    if (!formId) {
      fallbackReason = `${fallbackReason}_and_no_form_reference`;
    }
  }

  return {
    org_binding_via: facts.via,
    org_binding_is_fallback: isFallback,
    org_binding_authenticated: !isFallback,
    org_binding_claimed_organisation_id: claimed,
    org_binding_claim_matches_resolved: claimed ? claimed === facts.resolvedOrgId : null,
    org_binding_secret_header_present: facts.secretHeaderPresent,
    org_binding_shared_secret_present: facts.sharedSecretPresent,
    org_binding_bearer_present: facts.bearerPresent,
    org_binding_submitted_form_id: formId,
    org_binding_fallback_reason: fallbackReason,
  };
}
