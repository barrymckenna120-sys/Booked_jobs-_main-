import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveSweepScope } from "./sweepScope.ts";

const KN = "8c37827f-ce2c-4507-a821-a5e807d89856";
const DG = "f1950683-e8b9-41cf-8972-2aa59516850d";

const anon = { isServiceRole: false, hasGlobalSecret: false };

Deno.test("SECURITY: an unauthenticated caller is rejected with 401", () => {
  const scope = resolveSweepScope({ ...anon });
  assertEquals(scope, {
    kind: "deny",
    status: 401,
    error: "Unauthorized",
    detail: "no valid credentials",
  });
});

Deno.test("SECURITY: an unauthenticated caller cannot name an org to get in", () => {
  const scope = resolveSweepScope({ ...anon, requestedOrgId: KN });
  assertEquals(scope.kind, "deny");
});

Deno.test("SECURITY: one tenant cannot trigger another tenant's sends", () => {
  const scope = resolveSweepScope({ ...anon, secretOrg: DG, requestedOrgId: KN });
  assertEquals(scope, {
    kind: "deny",
    status: 403,
    error: "Forbidden",
    detail: "machine secret belongs to a different organisation",
  });
});

Deno.test("SECURITY: a tenant secret never yields an all-organisation sweep", () => {
  assertEquals(resolveSweepScope({ ...anon, secretOrg: DG }), { kind: "org", orgId: DG });
});

Deno.test("SECURITY: a signed-in user never yields an all-organisation sweep", () => {
  assertEquals(resolveSweepScope({ ...anon, userOrg: KN, userRole: "office" }), {
    kind: "org",
    orgId: KN,
  });
});

Deno.test("SECURITY: a user cannot request another tenant's org", () => {
  const scope = resolveSweepScope({
    ...anon,
    userOrg: DG,
    userRole: "office",
    requestedOrgId: KN,
  });
  assertEquals(scope, {
    kind: "deny",
    status: 403,
    error: "Forbidden",
    detail: "requested organisation_id is not the caller's org",
  });
});

Deno.test("a superadmin may act for a named organisation", () => {
  assertEquals(
    resolveSweepScope({ ...anon, userOrg: KN, userRole: "superadmin", requestedOrgId: DG }),
    { kind: "org", orgId: DG },
  );
});

Deno.test("the scheduled service-role path keeps sweeping every organisation", () => {
  assertEquals(resolveSweepScope({ isServiceRole: true, hasGlobalSecret: false }), {
    kind: "all",
  });
});

Deno.test("the cron shared-secret path keeps sweeping every organisation", () => {
  assertEquals(resolveSweepScope({ isServiceRole: false, hasGlobalSecret: true }), {
    kind: "all",
  });
});

Deno.test("a system caller naming an organisation narrows the sweep to it", () => {
  assertEquals(
    resolveSweepScope({ isServiceRole: true, hasGlobalSecret: false, requestedOrgId: DG }),
    { kind: "org", orgId: DG },
  );
});

Deno.test("blank / whitespace organisation_id is ignored, not treated as a request", () => {
  assertEquals(
    resolveSweepScope({ isServiceRole: true, hasGlobalSecret: false, requestedOrgId: "   " }),
    { kind: "all" },
  );
  assertEquals(
    resolveSweepScope({ ...anon, secretOrg: DG, requestedOrgId: "  " }),
    { kind: "org", orgId: DG },
  );
});
