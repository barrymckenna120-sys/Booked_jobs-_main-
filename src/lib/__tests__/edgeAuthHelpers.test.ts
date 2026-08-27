import { describe, expect, it } from "vitest";
import { evaluateConsent } from "../../../supabase/functions/_shared/messagingConsent";
import { matchIntegrations } from "../../../supabase/functions/_shared/machineOrg";
import {
  decidePlatformAdmin,
  parseOwnerAllowlist,
} from "../../../supabase/functions/_shared/platformAdmin";

const ORG_A = "org-a";
const ORG_B = "org-b";

describe("evaluateConsent", () => {
  it("allows a same-org customer and returns the DB phone", () => {
    const result = evaluateConsent(
      { id: "c1", name: "Paula", phone: "0871234567", opted_out: false, organisation_id: ORG_A },
      ORG_A,
    );
    expect(result).toEqual({ allowed: true, customerId: "c1", name: "Paula", phone: "0871234567" });
  });

  it("blocks opted-out customers", () => {
    const result = evaluateConsent(
      { id: "c1", phone: "0871234567", opted_out: true, organisation_id: ORG_A },
      ORG_A,
    );
    expect(result).toEqual({ allowed: false, reason: "customer_opted_out" });
  });

  it("treats another tenant's customer as wrong organisation", () => {
    const result = evaluateConsent(
      { id: "c1", phone: "0871234567", opted_out: false, organisation_id: ORG_B },
      ORG_A,
    );
    expect(result).toEqual({ allowed: false, reason: "customer_wrong_organisation" });
  });

  it("fails closed on a missing customer or missing phone", () => {
    expect(evaluateConsent(null, ORG_A)).toEqual({ allowed: false, reason: "customer_not_found" });
    expect(
      evaluateConsent({ id: "c1", phone: "  ", opted_out: false, organisation_id: ORG_A }, ORG_A),
    ).toEqual({ allowed: false, reason: "no_phone_number" });
  });
});

describe("matchIntegrations", () => {
  const rows = [
    { organisation_id: ORG_A, integration_type: "tally", config: { webhook_secret: "a-secret", form_id: "F-AAA" } },
    { organisation_id: ORG_B, integration_type: "tally", config: { webhook_secret_name: "B_SECRET", form_id: ["F-BBB"] } },
  ];

  it("binds by per-tenant inline secret", () => {
    expect(matchIntegrations(rows, { providedSecret: "a-secret" }).bySecret).toEqual([ORG_A]);
  });

  it("binds by env-named tenant secret", () => {
    const out = matchIntegrations(rows, {
      providedSecret: "b-secret",
      secretEnv: (n) => (n === "B_SECRET" ? "b-secret" : undefined),
    });
    expect(out.bySecret).toEqual([ORG_B]);
  });

  it("binds by upstream identifier, including array values", () => {
    expect(
      matchIntegrations(rows, { identifier: { keys: ["form_id"], value: "f-bbb" } }).byIdentifier,
    ).toEqual([ORG_B]);
  });

  it("matches nothing when neither secret nor identifier is presented", () => {
    expect(matchIntegrations(rows, {})).toEqual({ bySecret: [], byIdentifier: [] });
  });
});

describe("platform admin authorization", () => {
  it("parses the single owner allowlist", () => {
    expect(parseOwnerAllowlist("A@x.com, b@y.com ; not-an-email")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseOwnerAllowlist(null)).toEqual([]);
  });

  it("allows superadmin role and env-listed owners only", () => {
    expect(decidePlatformAdmin({ role: "superadmin", email: "x@y.com" }, [])).toEqual({
      allowed: true,
      via: "role",
    });
    expect(decidePlatformAdmin({ role: "admin", email: "owner@x.com" }, ["owner@x.com"])).toEqual({
      allowed: true,
      via: "platform_owner_env",
    });
    expect(decidePlatformAdmin({ role: "admin", email: "owner@x.com" }, [])).toEqual({
      allowed: false,
    });
  });
});
